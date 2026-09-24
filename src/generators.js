import { faker } from '@faker-js/faker';

// -------------------------------------------------------------------------
// Shared value pools & helpers
// -------------------------------------------------------------------------

const PROJECTS = [
  { projectName: 'FinCrime', dataModelCode: 'AML_GLOBAL', workflowName: 'AML_GLOBAL' },
  { projectName: 'FinCrime', dataModelCode: 'AML_GLOBAL', workflowName: 'ES' },
  { projectName: 'FinCrime', dataModelCode: 'AML_GLOBAL', workflowName: 'PT' },
  { projectName: 'KYC Demo', dataModelCode: 'DEMO', workflowName: 'DEMO' }
];

const CASE_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'ESCALATED'];
const TASK_STATUSES = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'ASSIGNED', 'PENDING_REVIEW'];
const TASK_TYPES = ['TIMER', 'MANUAL', 'SYSTEM', 'REVIEW'];
const TASK_SUBTYPES = ['SUBMIT', 'APPROVE', 'REJECT', 'REVIEW'];
const CASE_ROLES = ['Preparer', 'Reviewer', 'Engagement Partner', 'Quality Reviewer', 'Approver'];
const RELATIONSHIP_TYPES = ['PARENT', 'CHILD', 'DUPLICATE', 'RELATED', 'MERGED'];
const AUDIT_EVENTS = ['DOWNLOAD', 'UPLOAD', 'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'SUBMIT', 'APPROVE'];
const AUDIT_SCOPES = ['CASE', 'TASK', 'DOCUMENT', 'SYSTEM', 'USER'];
const DOCUMENT_TYPES = ['Document', 'Image', 'Report', 'Statement'];
const DOCUMENT_SUBTYPES = ['Client Request', 'Passport', 'Utility Bill', 'Bank Statement', 'Incorporation Certificate', 'Screening Report'];
const BLOCK_SCHEMAS = ['documentofincorporation', 'passport', 'utilitybill', 'bankstatement', 'screening', 'user'];
const SCHEMA_CODES = ['USER', 'DOCUMENT', 'ADDRESS', 'ENTITY', 'TRANSACTION', 'SCREENING', 'RISK'];

const uuid = () => faker.string.uuid();
const epoch = (date) => Math.floor(date.getTime() / 1000);
const isoZ = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const pick = (arr) => faker.helpers.arrayElement(arr);
const email = () => faker.internet.email({ provider: 'example.com' }).toLowerCase();

function makeUserPool(size = 25) {
  return Array.from({ length: size }, () => email());
}

function workflowFor(project) {
  return {
    dataModelCode: project.dataModelCode,
    workflowName: project.workflowName,
    workflowVersion: 1,
    projectName: project.projectName,
    dataModelVersion: 1,
    projectVersion: 1
  };
}

// ConfigurationColumnEntity-shaped object (Config Manager "List Columns")
function configColumn({ listType, attributeType, attributeName, attributeLabel, attributeValue, columnType }) {
  return {
    columnType,
    valueExpression: '',
    attributeValue: String(attributeValue),
    attributeType,
    attributeName,
    attributeLabel,
    additionalProperties: '[]',
    listType
  };
}

function caseRoles(users, count = faker.number.int({ min: 0, max: 3 })) {
  return Array.from({ length: count }, () => ({
    caseRole: pick(CASE_ROLES),
    users: faker.helpers.arrayElements(users, faker.number.int({ min: 1, max: 2 }))
  }));
}

function tags() {
  return faker.helpers.arrayElements(
    [
      { method: 'AUTOMATIC', name: 'CT1 Configured' },
      { method: 'AUTOMATIC', name: 'CT2 Configured' },
      { method: 'MANUAL', name: 'High Risk' },
      { method: 'AUTOMATIC', name: 'PEP Match' }
    ],
    faker.number.int({ min: 0, max: 2 })
  );
}

// -------------------------------------------------------------------------
// Case pool — generated first so dependent collections can reference it
// -------------------------------------------------------------------------

function buildCasePool(count) {
  return Array.from({ length: count }, () => {
    const project = pick(PROJECTS);
    const caseId = uuid();
    const shortId = caseId.slice(0, 6);
    const created = faker.date.past({ years: 2 });
    return {
      caseId,
      caseDisplayId: `FC-${shortId}`,
      project,
      entityName: faker.company.name(),
      status: pick(CASE_STATUSES),
      createdOn: created,
      owner: email()
    };
  });
}

// -------------------------------------------------------------------------
// Per-collection generators
// -------------------------------------------------------------------------

function genTaskMetadata(ctx, count) {
  return Array.from({ length: count }, () => {
    const c = pick(ctx.cases);
    const created = faker.date.recent({ days: 300, refDate: new Date() });
    const roles = caseRoles(ctx.users);
    return {
      internalTaskStatus: pick(TASK_STATUSES),
      paused: faker.datatype.boolean(),
      enableReviewer: faker.datatype.boolean(),
      caseStatus: c.status,
      roles: [],
      caseDisplayId: c.caseDisplayId,
      description: pick(['Case Actions', 'Mandatory Review Date', 'Screening Review', 'Document Verification']),
      taskGUID: String(faker.number.int({ min: 1000, max: 9999 })),
      taskEndDate: epoch(faker.date.future({ years: 1, refDate: created })),
      slaStatus: { slaStatus: pick(['ON_TRACK', 'AMBER', 'BREACHED']), elapsedUnits: 0, timeUnits: 'SECONDS' },
      taskType: pick(TASK_TYPES),
      timerUnits: 'MONTHS',
      dateCreated: isoZ(created),
      dateLastModified: isoZ(created),
      caseCreationDate: isoZ(c.createdOn),
      caseId: c.caseId,
      caseOwner: c.owner,
      assignee: pick(ctx.users),
      taskStatus: '',
      workflow: workflowFor(c.project),
      slaRedDays: '10',
      slaAmberDays: '5',
      caseRoles: roles,
      taskListColumnConfigurations: [
        configColumn({ listType: 'TASK_LIST', attributeType: 'CASE_DATA', attributeName: 'entityName', attributeLabel: 'Entity Name', attributeValue: c.entityName, columnType: 'TASK_LINK' }),
        configColumn({ listType: 'TASK_LIST', attributeType: 'TASK_METADATA', attributeName: 'caseDisplayId', attributeLabel: 'Case ID', attributeValue: c.caseDisplayId, columnType: 'TEXT' }),
        configColumn({ listType: 'TASK_LIST', attributeType: 'CASE_DATA', attributeName: 'riskLevel', attributeLabel: 'Risk Level', attributeValue: pick(['Low', 'Medium', 'High']), columnType: 'TEXT' })
      ],
      timerPeriod: faker.number.int({ min: 1, max: 60 }),
      tags: tags(),
      removed: false,
      taskStartDate: epoch(created),
      taskName: pick(['Case Actions', 'Mandatory Review Date', 'Screening Review', 'Document Verification']),
      taskSubType: pick(TASK_SUBTYPES),
      lastModifiedBy: pick(ctx.users)
    };
  });
}

function genTaskHistory(ctx, count) {
  return Array.from({ length: count }, () => {
    const c = pick(ctx.cases);
    const created = faker.date.past({ years: 2 });
    return {
      internalTaskStatus: pick(TASK_STATUSES),
      paused: faker.datatype.boolean(),
      roles: pick([[], ['System']]),
      caseDisplayId: c.caseDisplayId,
      description: pick(['Mandatory Review Date (Migrated)', 'Case Actions', 'Screening Review']),
      taskGUID: String(faker.number.int({ min: 1000, max: 9999 })),
      slaStatus: { slaStatus: pick(['ON_TRACK', 'AMBER', 'BREACHED']), elapsedUnits: 0, timeUnits: 'SECONDS' },
      taskEndDate: epoch(faker.date.future({ years: 1, refDate: created })),
      timerUnits: 'MONTHS',
      taskType: pick(TASK_TYPES),
      dateCreated: created.toISOString(),
      dateLastModified: created.toISOString(),
      caseCreationDate: isoZ(c.createdOn),
      caseId: c.caseId,
      caseOwner: c.owner,
      assignee: pick(ctx.users),
      taskStatus: '',
      workflow: workflowFor(c.project),
      slaRedDays: '10',
      slaAmberDays: '5',
      caseRoles: caseRoles(ctx.users, faker.number.int({ min: 0, max: 2 })),
      taskListColumnConfigurations: [
        configColumn({ listType: 'TASK_LIST', attributeType: 'TASK_METADATA', attributeName: 'caseDisplayId', attributeLabel: 'Case ID', attributeValue: c.caseDisplayId, columnType: 'TEXT' }),
        configColumn({ listType: 'TASK_LIST', attributeType: 'CASE_DATA', attributeName: 'legalName', attributeLabel: 'Entity Name', attributeValue: c.entityName, columnType: 'TEXT' })
      ],
      timerPeriod: faker.number.int({ min: 1, max: 60 }),
      tags: tags(),
      removed: false,
      taskStartDate: epoch(created),
      taskName: pick(['Mandatory Review Date (Migrated)', 'Case Actions', 'Screening Review']),
      compositeId: { taskId: uuid() },
      taskSubType: pick(TASK_SUBTYPES)
    };
  });
}

function genCaseEntity(ctx) {
  // one document per case in the pool (keeps caseId referential integrity)
  return ctx.cases.map((c) => ({
    caseId: c.caseId,
    version: 0,
    workflow: workflowFor(c.project),
    createdOn: c.createdOn.toISOString(),
    columnConfigurations: [
      { id: uuid(), attributeLabel: 'Case id', attributeName: 'id', attributeType: 'CASE_METADATA', columnType: 'CASE_LINK', listType: 'CASE_LIST', additionalProperties: '[]', valueExpression: '' },
      { id: uuid(), attributeLabel: 'Case #', attributeName: 'caseDisplayId', attributeType: 'CASE_METADATA', columnType: 'TEXT', listType: 'CASE_LIST', additionalProperties: '[]', valueExpression: '' },
      { id: uuid(), attributeLabel: 'Entity Name', attributeName: 'entityName', attributeType: 'CASE_DATA', columnType: 'TEXT', listType: 'CASE_LIST', additionalProperties: '[]', valueExpression: '' },
      { id: uuid(), attributeLabel: 'Status', attributeName: 'status', attributeType: 'CASE_METADATA', columnType: 'TEXT', listType: 'CASE_LIST', additionalProperties: '[]', valueExpression: '' }
    ],
    caseRoles: caseRoles(ctx.users),
    closedOn: c.status === 'CLOSED' ? isoZ(faker.date.recent({ days: 30 })) : '1970-01-01T00:00:00Z',
    versionDate: epoch(c.createdOn),
    status: c.status,
    caseDisplayId: c.caseDisplayId,
    entityName: c.entityName,
    createdOnDate: c.createdOn
  }));
}

function genDocumentCenter(ctx, count) {
  return Array.from({ length: count }, () => {
    const c = pick(ctx.cases);
    const docGuid = uuid();
    const ext = pick(['png', 'pdf', 'jpg', 'xlsx']);
    const created = faker.date.recent({ days: 200 });
    return {
      documentSubType: pick(DOCUMENT_SUBTYPES),
      deleteCreationDate: null,
      documentOriginalName: `${uuid()}.${ext}`,
      workflow: workflowFor(c.project),
      documentType: pick(DOCUMENT_TYPES),
      active: true,
      documentName: `${uuid()}.${ext}`,
      version: 1,
      delete: null,
      documentGUID: docGuid,
      documentPath: `${docGuid}.${ext}`,
      tags: [`CaseId : ${c.caseId}`],
      ingestionDate: epoch(created),
      md5Hash: faker.string.hexadecimal({ length: 32, prefix: '' }).toUpperCase(),
      documentAttributeDetails: [],
      caseId: c.caseId,
      correlationId: null,
      columnConfigurations: [
        configColumn({ listType: 'DOCUMENT_LIST', attributeType: 'DOCUMENT_METADATA', attributeName: 'ingestionDate', attributeLabel: 'Ingestion Date', attributeValue: isoZ(created), columnType: 'EPOCH_DATE' }),
        configColumn({ listType: 'DOCUMENT_LIST', attributeType: 'DOCUMENT_METADATA', attributeName: 'documentSubType', attributeLabel: 'Document Sub Type', attributeValue: pick(DOCUMENT_SUBTYPES), columnType: 'TEXT' })
      ],
      compositeId: { caseId: c.caseId, documentGUID: docGuid },
      uploadedBy: pick(ctx.users),
      expirationDate: epoch(faker.date.future({ years: 1 }))
    };
  });
}

function genEntityList(ctx, count) {
  return Array.from({ length: count }, () => {
    const itemType = pick(['ORGANISATION', 'INDIVIDUAL']);
    const isOrg = itemType === 'ORGANISATION';
    const name = isOrg ? faker.company.name() : faker.person.fullName();
    const tin = faker.finance.accountNumber(9);
    const created = epoch(faker.date.past({ years: 1 }));
    return {
      id: uuid(),
      dataParticleReferences: Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () => uuid()),
      dataBlockReferences: Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () => uuid()),
      businessKey: JSON.stringify([[{ name: 'taxIdentificationNumber', value: name, values: null }]]),
      displayName: name,
      tenant: pick(['DEMO', 'FinCrime', '1']),
      entityListColumnConfigurations: [
        configColumn({ listType: 'ENTITY_LIST', attributeType: 'ENTITY_METADATA', attributeName: 'deletedDate', attributeLabel: 'Date Deleted', attributeValue: '', columnType: 'EPOCH_DATE' }),
        configColumn({ listType: 'ENTITY_LIST', attributeType: 'ENTITY_DATA', attributeName: 'taxIdentificationNumber', attributeLabel: 'Tax Identification Number', attributeValue: tin, columnType: 'TEXT' }),
        configColumn({ listType: 'ENTITY_LIST', attributeType: 'ENTITY_DATA', attributeName: isOrg ? 'legalName' : 'fullName', attributeLabel: isOrg ? 'Legal Name' : 'Full Name', attributeValue: name, columnType: 'TEXT' })
      ],
      isDeleted: false,
      itemType,
      createdDate: created,
      lastModifiedDate: created,
      lastModifiedBy: pick(ctx.users),
      version: 0
    };
  });
}

function genLinkCases(ctx, count) {
  return Array.from({ length: count }, () => {
    const a = pick(ctx.cases);
    let b = pick(ctx.cases);
    while (b.caseId === a.caseId && ctx.cases.length > 1) b = pick(ctx.cases);
    const rel = pick(RELATIONSHIP_TYPES);
    return {
      id: uuid(),
      linkId: uuid(),
      caseId: a.caseId,
      linkCaseId: b.caseId,
      relationshipType: rel,
      linkLabel: rel.charAt(0) + rel.slice(1).toLowerCase(),
      createdBy: pick(ctx.users),
      createdOn: epoch(faker.date.past({ years: 1 })),
      columnConfigurations: [
        configColumn({ listType: 'CASE_LIST', attributeType: 'CASE_METADATA', attributeName: 'caseDisplayId', attributeLabel: 'Alert/Case ID', attributeValue: b.caseDisplayId, columnType: 'CASE_LINK' }),
        configColumn({ listType: 'CASE_LIST', attributeType: 'CASE_DATA', attributeName: 'Case_Type', attributeLabel: 'Alert/Case Type', attributeValue: pick(['TM Alert', 'KYC Review', 'Sanctions Hit']), columnType: 'TEXT' })
      ]
    };
  });
}

function genAuditData(ctx, count) {
  return Array.from({ length: count }, () => {
    const c = pick(ctx.cases);
    const author = pick(ctx.users);
    const ts = faker.date.recent({ days: 90 }).getTime();
    const event = pick(AUDIT_EVENTS);
    return {
      workflow: {
        dataModelCode: c.project.dataModelCode,
        workflowName: c.project.workflowName,
        workflowVersion: '1',
        projectName: c.project.projectName,
        dataModelVersion: '1',
        projectVersion: '1'
      },
      author,
      description: pick([
        'A user has downloaded a document.',
        'A user has uploaded a document.',
        'A case status was updated.',
        'A task was assigned to a user.'
      ]),
      auditTemplates: {},
      logLevel: pick(['INFO', 'WARN', 'DEBUG']),
      application: pick(['System', 'Query Manager', 'Global Query', 'Document Center']),
      caseId: c.caseId,
      scope: pick(AUDIT_SCOPES),
      notificationId: `USR_${event}_${pick(['DOCUMENT', 'CASE', 'TASK'])}`,
      attributes: {
        date: String(ts),
        caseId: c.caseId,
        tenantId: c.project.dataModelCode,
        userName: author,
        documentName: `${faker.system.fileName()}`,
        documentGUID: uuid()
      },
      id: uuid(),
      event,
      timestamp: ts,
      status: pick(['SUCCESS', 'FAILURE']),
      auditListColumnEntityList: [
        { columnType: 'DATE_TIME', attributeValue: String(Math.floor(ts / 1000)), attributeType: '', attributeName: 'timestamp', attributeLabel: 'Timestamp' },
        { columnType: 'TEXT', attributeValue: author, attributeType: '', attributeName: 'author', attributeLabel: 'Author' }
      ]
    };
  });
}

function genCaseGraph(ctx, count) {
  // ES index was empty; generate a minimal node/edge topology per case.
  return Array.from({ length: count }, () => {
    const c = pick(ctx.cases);
    const nodeCount = faker.number.int({ min: 2, max: 5 });
    const nodes = Array.from({ length: nodeCount }, () => ({
      id: uuid(),
      label: pick(['Case', 'Entity', 'Account', 'Transaction']),
      name: faker.company.name()
    }));
    const edges = nodes.slice(1).map((n) => ({
      source: nodes[0].id,
      target: n.id,
      relationship: pick(RELATIONSHIP_TYPES)
    }));
    return { caseId: c.caseId, nodes, edges, createdOn: epoch(faker.date.recent({ days: 60 })) };
  });
}

function genBusinessKeys(ctx, count) {
  return Array.from({ length: count }, () => ({
    dataBlockGUID: uuid(),
    blockSchema: pick(BLOCK_SCHEMAS),
    tenant: pick(['DEMO', 'FinCrime', '1']),
    dataBlockBusinessKeys: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => `${pick(['citizenshipCardId', 'passportId', 'taxId'])} ${faker.string.numeric(9)}`),
    createdOn: isoZ(faker.date.past({ years: 1 }))
  }));
}

function genRecyclingRequest(ctx, count) {
  return Array.from({ length: count }, () => {
    const c = pick(ctx.cases);
    return {
      id: uuid(),
      caseId: c.caseId,
      businessKey: [],
      schemaCode: faker.helpers.arrayElements(SCHEMA_CODES, faker.number.int({ min: 1, max: 5 })),
      status: pick(['Active', 'Pending', 'Resolved'])
    };
  });
}

// -------------------------------------------------------------------------
// Orchestration
// -------------------------------------------------------------------------

const DEFAULT_COUNTS = {
  cases: 200,
  task_metadata_entity: 300,
  task_history: 500,
  document_center_entity: 400,
  entity_list: 250,
  link_cases: 150,
  'audit-data-service': 600,
  case_graph: 120,
  data_block_business_keys_entity: 200,
  data_block_recycling_request: 100
};

/**
 * Build the full synthetic dataset with referential integrity across collections.
 * @param {object} overrides optional per-collection count overrides
 * @returns {Record<string, object[]>}
 */
export function buildDataset(overrides = {}) {
  const counts = { ...DEFAULT_COUNTS, ...overrides };
  const ctx = {
    users: makeUserPool(30),
    cases: buildCasePool(counts.cases)
  };

  return {
    case_entity: genCaseEntity(ctx),
    task_metadata_entity: genTaskMetadata(ctx, counts.task_metadata_entity),
    task_history: genTaskHistory(ctx, counts.task_history),
    document_center_entity: genDocumentCenter(ctx, counts.document_center_entity),
    entity_list: genEntityList(ctx, counts.entity_list),
    link_cases: genLinkCases(ctx, counts.link_cases),
    'audit-data-service': genAuditData(ctx, counts['audit-data-service']),
    case_graph: genCaseGraph(ctx, counts.case_graph),
    data_block_business_keys_entity: genBusinessKeys(ctx, counts.data_block_business_keys_entity),
    data_block_recycling_request: genRecyclingRequest(ctx, counts.data_block_recycling_request)
  };
}

export { DEFAULT_COUNTS };
