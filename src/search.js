import { getDb } from './mongo.js';

const INDEX = 'default';

// Detect the "no Atlas Search available" class of errors so the UI can explain it.
function isSearchUnavailable(msg = '') {
  return /\$search|search index|Atlas Search|index not found|mongot|index.*does not exist|Search stage/i.test(msg);
}

// Deep-clone to MongoDB Extended JSON so returned pipelines paste cleanly into mongosh/Compass.
function ejsonSafe(v) {
  if (v instanceof Date) return { $date: v.toISOString() };
  if (Array.isArray(v)) return v.map(ejsonSafe);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = ejsonSafe(val);
    return out;
  }
  return v;
}

function facetDefsToMongo(defs = []) {
  const out = {};
  for (const d of defs) out[d.name] = { type: d.type || 'string', path: d.path };
  return out;
}

function parseFacets(metaDoc, defs = []) {
  const result = {};
  const facet = metaDoc?.facet ?? {};
  for (const d of defs) {
    const buckets = facet[d.name]?.buckets ?? [];
    result[d.name] = buckets.map((b) => ({ value: b._id, count: b.count }));
  }
  return result;
}

/**
 * Generic faceted Atlas Search over a single collection.
 * Runs the results query and the $searchMeta facet query in parallel.
 */
async function facetedSearch(db, cfg) {
  const {
    collection, query, textPaths = [], textFuzzy, embedded, filters = [],
    range, facetDefs = [], sortField, sortDir = -1, sortByRelevance = true,
    existsPath, page = 0, limit = 20, project, highlightPaths
  } = cfg;

  const compound = { must: [], filter: [], should: [] };

  if (query && query.trim()) {
    const should = [{ text: { query, path: textPaths, fuzzy: textFuzzy || { maxEdits: 1, prefixLength: 1 } } }];
    if (embedded) {
      should.push({
        embeddedDocument: {
          path: embedded.path,
          operator: { text: { query, path: embedded.valuePath, fuzzy: { maxEdits: 2 } } }
        }
      });
    }
    compound.must.push({ compound: { should, minimumShouldMatch: 1 } });
  }

  for (const f of filters) {
    if (f.value == null || f.value === '') continue;
    compound.filter.push({ equals: { path: f.path, value: f.value } });
  }

  if (range && (range.gte != null || range.lte != null)) {
    const r = { path: range.path };
    if (range.gte != null) r.gte = range.gte;
    if (range.lte != null) r.lte = range.lte;
    compound.filter.push({ range: r });
  }

  if (!compound.must.length && !compound.filter.length) {
    compound.must.push({ exists: { path: existsPath } });
  }

  const searchStage = { index: INDEX, compound };
  if (query && query.trim() && highlightPaths?.length) {
    searchStage.highlight = { path: highlightPaths };
  }
  if (!sortByRelevance && sortField) {
    searchStage.sort = { [sortField]: sortDir };
  }

  const projStage = {
    ...project,
    score: { $meta: 'searchScore' }
  };
  if (query && query.trim() && highlightPaths?.length) {
    projStage.highlights = { $meta: 'searchHighlights' };
  }

  const resultsPipeline = [
    { $search: searchStage },
    { $skip: page * limit },
    { $limit: limit },
    { $project: projStage }
  ];

  const metaPipeline = [
    { $searchMeta: { index: INDEX, facet: { operator: { compound }, facets: facetDefsToMongo(facetDefs) } } }
  ];

  const [hits, meta] = await Promise.all([
    db.collection(collection).aggregate(resultsPipeline).toArray(),
    facetDefs.length
      ? db.collection(collection).aggregate(metaPipeline).toArray().catch(() => [])
      : Promise.resolve([])
  ]);

  const metaDoc = meta[0];
  const total = metaDoc?.count?.total ?? metaDoc?.count?.lowerBound ?? hits.length;

  const pipelines = [{ label: 'Results', collection, pipeline: ejsonSafe(resultsPipeline) }];
  if (facetDefs.length) {
    pipelines.push({ label: 'Facets ($searchMeta)', collection, pipeline: ejsonSafe(metaPipeline) });
  }

  return { hits, total, facets: parseFacets(metaDoc, facetDefs), pipelines };
}

// ---------------------------------------------------------------------------
// 1 · Global (federated) search
// ---------------------------------------------------------------------------

const GLOBAL_TARGETS = [
  {
    collection: 'case_entity', type: 'Case',
    paths: ['entityName', 'caseDisplayId'],
    project: { _id: 0, caseId: 1, caseDisplayId: 1, entityName: 1, status: 1, 'workflow.projectName': 1 },
    title: (d) => d.entityName || d.caseDisplayId,
    subtitle: (d) => [d.caseDisplayId, d.status, d.workflow?.projectName].filter(Boolean).join('  ·  ')
  },
  {
    collection: 'entity_list', type: 'Entity',
    paths: ['displayName', 'businessKey'],
    project: { _id: 0, id: 1, displayName: 1, itemType: 1, tenant: 1 },
    title: (d) => d.displayName,
    subtitle: (d) => [d.itemType, d.tenant].filter(Boolean).join('  ·  ')
  },
  {
    collection: 'document_center_entity', type: 'Document',
    paths: ['documentName', 'documentOriginalName', 'tags'],
    project: { _id: 0, documentGUID: 1, documentName: 1, documentType: 1, documentSubType: 1, caseId: 1, uploadedBy: 1 },
    title: (d) => d.documentName,
    subtitle: (d) => [d.documentType, d.documentSubType, d.uploadedBy].filter(Boolean).join('  ·  ')
  },
  {
    collection: 'task_metadata_entity', type: 'Task',
    paths: ['taskName', 'description', 'caseDisplayId'],
    project: { _id: 0, caseId: 1, caseDisplayId: 1, taskName: 1, description: 1, internalTaskStatus: 1, assignee: 1 },
    title: (d) => d.taskName,
    subtitle: (d) => [d.caseDisplayId, d.internalTaskStatus, d.assignee].filter(Boolean).join('  ·  ')
  }
];

export async function globalSearch(uri, dbName, { query, perType = 5 }) {
  const db = await getDb(uri, dbName);
  if (!query || !query.trim()) return { ok: true, query, groups: [], pipelines: [] };

  let unavailable = false;
  const groups = await Promise.all(GLOBAL_TARGETS.map(async (t) => {
    const pipeline = [
      {
        $search: {
          index: INDEX,
          compound: { should: [{ text: { query, path: t.paths, fuzzy: { maxEdits: 1, prefixLength: 1 } } }] },
          highlight: { path: t.paths }
        }
      },
      { $limit: perType },
      { $project: { ...t.project, score: { $meta: 'searchScore' }, highlights: { $meta: 'searchHighlights' } } }
    ];
    try {
      const rows = await db.collection(t.collection).aggregate(pipeline).toArray();
      return {
        type: t.type, collection: t.collection, pipeline,
        hits: rows.map((r) => ({
          title: t.title(r), subtitle: t.subtitle(r),
          score: r.score, highlights: r.highlights, doc: r
        }))
      };
    } catch (e) {
      if (isSearchUnavailable(e.message)) unavailable = true;
      return { type: t.type, collection: t.collection, pipeline, hits: [], error: e.message };
    }
  }));

  const pipelines = groups.map((g) => ({
    label: `${g.type}s`, collection: g.collection, pipeline: ejsonSafe(g.pipeline)
  }));

  return { ok: !unavailable, searchUnavailable: unavailable, query, groups, pipelines };
}

// ---------------------------------------------------------------------------
// 2 · Case search + facets
// ---------------------------------------------------------------------------

export async function searchCases(uri, dbName, opts = {}) {
  const db = await getDb(uri, dbName);
  const { query, status, project, workflow, from, to, sort = 'relevance', page = 0, limit = 20 } = opts;
  try {
    const res = await facetedSearch(db, {
      collection: 'case_entity',
      query,
      textPaths: ['entityName', 'caseDisplayId'],
      highlightPaths: ['entityName', 'caseDisplayId'],
      filters: [
        { path: 'status', value: status },
        { path: 'workflow.projectName', value: project },
        { path: 'workflow.workflowName', value: workflow }
      ],
      range: (from || to) ? { path: 'createdOnDate', gte: from ? new Date(from) : null, lte: to ? new Date(to) : null } : null,
      facetDefs: [
        { name: 'status', path: 'status' },
        { name: 'project', path: 'workflow.projectName' },
        { name: 'workflow', path: 'workflow.workflowName' }
      ],
      sortByRelevance: sort === 'relevance',
      sortField: 'createdOnDate',
      existsPath: 'caseId',
      page, limit,
      project: {
        _id: 0, caseId: 1, caseDisplayId: 1, entityName: 1, status: 1,
        workflow: 1, createdOn: 1, columns: { $slice: ['$columnConfigurations', 4] }
      }
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, searchUnavailable: isSearchUnavailable(e.message), error: e.message };
  }
}

// ---------------------------------------------------------------------------
// 3 · Entity name screening (fuzzy)
// ---------------------------------------------------------------------------

export async function searchEntities(uri, dbName, opts = {}) {
  const db = await getDb(uri, dbName);
  const { query, itemType, tenant, page = 0, limit = 20 } = opts;
  try {
    const res = await facetedSearch(db, {
      collection: 'entity_list',
      query,
      textPaths: ['displayName', 'businessKey'],
      textFuzzy: { maxEdits: 2, prefixLength: 0 },
      highlightPaths: ['displayName', 'businessKey'],
      embedded: { path: 'entityListColumnConfigurations', valuePath: 'entityListColumnConfigurations.attributeValue' },
      filters: [
        { path: 'itemType', value: itemType },
        { path: 'tenant', value: tenant }
      ],
      facetDefs: [
        { name: 'itemType', path: 'itemType' },
        { name: 'tenant', path: 'tenant' }
      ],
      existsPath: 'id',
      page, limit,
      project: {
        _id: 0, id: 1, displayName: 1, itemType: 1, tenant: 1, businessKey: 1,
        columns: { $slice: ['$entityListColumnConfigurations', 6] }
      }
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, searchUnavailable: isSearchUnavailable(e.message), error: e.message };
  }
}

// ---------------------------------------------------------------------------
// 4 · Documents / Tasks / Audit tabs
// ---------------------------------------------------------------------------

export async function searchDocuments(uri, dbName, opts = {}) {
  const db = await getDb(uri, dbName);
  const { query, documentType, documentSubType, uploadedBy, page = 0, limit = 20 } = opts;
  try {
    const res = await facetedSearch(db, {
      collection: 'document_center_entity',
      query,
      textPaths: ['documentName', 'documentOriginalName', 'tags'],
      highlightPaths: ['documentName', 'documentOriginalName', 'tags'],
      embedded: { path: 'columnConfigurations', valuePath: 'columnConfigurations.attributeValue' },
      filters: [
        { path: 'documentType', value: documentType },
        { path: 'documentSubType', value: documentSubType },
        { path: 'uploadedBy', value: uploadedBy }
      ],
      facetDefs: [
        { name: 'documentType', path: 'documentType' },
        { name: 'documentSubType', path: 'documentSubType' },
        { name: 'uploadedBy', path: 'uploadedBy' }
      ],
      existsPath: 'documentGUID',
      page, limit,
      project: {
        _id: 0, documentGUID: 1, documentName: 1, documentOriginalName: 1, documentType: 1,
        documentSubType: 1, caseId: 1, uploadedBy: 1, ingestionDate: 1, tags: 1
      }
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, searchUnavailable: isSearchUnavailable(e.message), error: e.message };
  }
}

export async function searchTasks(uri, dbName, opts = {}) {
  const db = await getDb(uri, dbName);
  const { query, internalTaskStatus, taskType, assignee, page = 0, limit = 20 } = opts;
  try {
    const res = await facetedSearch(db, {
      collection: 'task_metadata_entity',
      query,
      textPaths: ['taskName', 'description', 'caseDisplayId'],
      highlightPaths: ['taskName', 'description', 'caseDisplayId'],
      filters: [
        { path: 'internalTaskStatus', value: internalTaskStatus },
        { path: 'taskType', value: taskType },
        { path: 'assignee', value: assignee }
      ],
      facetDefs: [
        { name: 'internalTaskStatus', path: 'internalTaskStatus' },
        { name: 'taskType', path: 'taskType' },
        { name: 'assignee', path: 'assignee' }
      ],
      existsPath: 'caseId',
      page, limit,
      project: {
        _id: 0, caseId: 1, caseDisplayId: 1, taskName: 1, description: 1,
        internalTaskStatus: 1, taskType: 1, assignee: 1, caseStatus: 1
      }
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, searchUnavailable: isSearchUnavailable(e.message), error: e.message };
  }
}

export async function searchAudit(uri, dbName, opts = {}) {
  const db = await getDb(uri, dbName);
  const { query, event, application, scope, from, to, page = 0, limit = 20 } = opts;
  const range = (from || to)
    ? { path: 'timestamp', gte: from ? new Date(from).getTime() : null, lte: to ? new Date(to).getTime() : null }
    : null;
  try {
    const res = await facetedSearch(db, {
      collection: 'audit-data-service',
      query,
      textPaths: ['description'],
      highlightPaths: ['description'],
      filters: [
        { path: 'event', value: event },
        { path: 'application', value: application },
        { path: 'scope', value: scope }
      ],
      range,
      facetDefs: [
        { name: 'event', path: 'event' },
        { name: 'application', path: 'application' },
        { name: 'scope', path: 'scope' }
      ],
      existsPath: 'id',
      sortByRelevance: !!(query && query.trim()),
      sortField: 'timestamp',
      page, limit,
      project: {
        _id: 0, id: 1, event: 1, application: 1, scope: 1, author: 1,
        description: 1, status: 1, caseId: 1, timestamp: 1
      }
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, searchUnavailable: isSearchUnavailable(e.message), error: e.message };
  }
}

// ---------------------------------------------------------------------------
// 5 · Autocomplete + More Like This (polish)
// ---------------------------------------------------------------------------

const AC_TARGETS = [
  { collection: 'case_entity', path: 'entityName', type: 'Entity name', project: { _id: 0, entityName: 1, caseDisplayId: 1, caseId: 1 }, label: (d) => d.entityName, sub: (d) => d.caseDisplayId },
  { collection: 'case_entity', path: 'caseDisplayId', type: 'Case ID', project: { _id: 0, entityName: 1, caseDisplayId: 1, caseId: 1 }, label: (d) => d.caseDisplayId, sub: (d) => d.entityName },
  { collection: 'entity_list', path: 'displayName', type: 'Party', project: { _id: 0, displayName: 1, itemType: 1, id: 1 }, label: (d) => d.displayName, sub: (d) => d.itemType }
];

export async function autocomplete(uri, dbName, { query }) {
  const db = await getDb(uri, dbName);
  if (!query || !query.trim()) return { ok: true, suggestions: [], pipelines: [] };

  let unavailable = false;
  const pipelines = [];
  const groups = await Promise.all(AC_TARGETS.map(async (t) => {
    const pipeline = [
      { $search: { index: INDEX, autocomplete: { query, path: t.path, fuzzy: { maxEdits: 1 } } } },
      { $limit: 5 },
      { $project: t.project }
    ];
    pipelines.push({ label: t.type, collection: t.collection, pipeline: ejsonSafe(pipeline) });
    try {
      const rows = await db.collection(t.collection).aggregate(pipeline).toArray();
      return rows.map((r) => ({ type: t.type, label: t.label(r), sub: t.sub(r) }));
    } catch (e) {
      if (isSearchUnavailable(e.message)) unavailable = true;
      return [];
    }
  }));

  const seen = new Set();
  const suggestions = groups.flat().filter((s) => {
    if (!s.label) return false;
    const key = `${s.type}:${s.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);

  return { ok: !unavailable, searchUnavailable: unavailable, suggestions, pipelines };
}

const MLT_CONFIG = {
  case_entity: { idField: 'caseId', likeFields: ['entityName', 'status'], project: { _id: 0, caseId: 1, caseDisplayId: 1, entityName: 1, status: 1, workflow: 1 } },
  document_center_entity: { idField: 'documentGUID', likeFields: ['documentName', 'documentSubType'], project: { _id: 0, documentGUID: 1, documentName: 1, documentType: 1, documentSubType: 1, caseId: 1 } }
};

export async function moreLikeThis(uri, dbName, { collection, id, limit = 5 }) {
  const db = await getDb(uri, dbName);
  const cfg = MLT_CONFIG[collection];
  if (!cfg) return { ok: false, error: `More Like This not supported for ${collection}` };

  const source = await db.collection(collection).findOne({ [cfg.idField]: id });
  if (!source) return { ok: false, error: 'Source document not found' };

  const like = {};
  for (const f of cfg.likeFields) if (source[f] != null) like[f] = source[f];

  const pipeline = [
    { $search: { index: INDEX, moreLikeThis: { like } } },
    { $match: { [cfg.idField]: { $ne: id } } },
    { $limit: limit },
    { $project: { ...cfg.project, score: { $meta: 'searchScore' } } }
  ];
  try {
    const hits = await db.collection(collection).aggregate(pipeline).toArray();
    return { ok: true, source, hits, pipelines: [{ label: 'More Like This', collection, pipeline: ejsonSafe(pipeline) }] };
  } catch (e) {
    return { ok: false, searchUnavailable: isSearchUnavailable(e.message), error: e.message };
  }
}
