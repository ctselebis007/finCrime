const $ = (id) => document.getElementById(id);
const STORE_KEY = 'fincrime.conn';

const state = {
  tab: 'all',
  query: '',
  page: 0,
  limit: 20,
  sort: 'relevance',
  filters: {},
  showPipeline: false,
  lastPipelines: []
};

// Facet group labels per tab (facet key -> display label). Keys double as filter params.
const FACET_LABELS = {
  cases: { status: 'Status', project: 'Project', workflow: 'Workflow' },
  entities: { itemType: 'Type', tenant: 'Tenant' },
  documents: { documentType: 'Type', documentSubType: 'Sub-type', uploadedBy: 'Uploaded by' },
  tasks: { internalTaskStatus: 'Status', taskType: 'Task type', assignee: 'Assignee' },
  audit: { event: 'Event', application: 'Application', scope: 'Scope' }
};

const TAB_ENDPOINT = {
  cases: '/api/search/cases',
  entities: '/api/search/entities',
  documents: '/api/search/documents',
  tasks: '/api/search/tasks',
  audit: '/api/search/audit'
};

// -------------------- connection --------------------
function loadConn() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}');
    if (s.uri) $('uri').value = s.uri;
    if (s.dbName) $('dbName').value = s.dbName;
  } catch { /* ignore */ }
}
function conn() {
  return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}');
}
function saveConn() {
  const uri = $('uri').value.trim();
  const dbName = $('dbName').value.trim();
  sessionStorage.setItem(STORE_KEY, JSON.stringify({ uri, dbName }));
}

async function api(pathname, body) {
  const { uri, dbName } = conn();
  if (!uri || !dbName) throw new Error('NO_CONN');
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri, dbName, ...body })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// -------------------- utils --------------------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function fmtEpoch(v) {
  if (v == null) return '';
  const ms = v > 1e12 ? v : v * 1000;
  const d = new Date(ms);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function highlightsToHtml(highlights) {
  if (!highlights || !highlights.length) return '';
  const parts = highlights.slice(0, 2).map((h) => {
    const txt = (h.texts || []).map((t) => (t.type === 'hit' ? `<mark>${esc(t.value)}</mark>` : esc(t.value))).join('');
    return `<div class="rc-highlight">${txt}</div>`;
  });
  return parts.join('');
}
function attrFromColumns(cols, name) {
  if (!Array.isArray(cols)) return '';
  const hit = cols.find((c) => c.attributeName === name);
  return hit ? hit.attributeValue : '';
}

// -------------------- rendering: cards --------------------
function scoreTag(score) {
  return score != null ? `<span class="rc-score">score ${score.toFixed(2)}</span>` : '';
}

function caseCard(d) {
  const chips = [
    ['Case', d.caseDisplayId],
    ['Status', d.status],
    ['Project', d.workflow?.projectName],
    ['Created', d.createdOn ? String(d.createdOn).slice(0, 10) : '']
  ].filter(([, v]) => v).map(([k, v]) => `<span class="chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('');
  return `<div class="result-card">
    <div class="rc-head"><span class="rc-type">Case</span><span class="rc-title">${esc(d.entityName || d.caseDisplayId)}</span>${scoreTag(d.score)}</div>
    ${highlightsToHtml(d.highlights)}
    <div class="rc-chips">${chips}</div>
    <div class="rc-actions"><button class="btn btn-ghost mlt-btn" data-collection="case_entity" data-id="${esc(d.caseId)}">Find similar</button></div>
  </div>`;
}

function entityCard(d) {
  const tin = attrFromColumns(d.columns, 'taxIdentificationNumber');
  const chips = [
    ['Type', d.itemType],
    ['Tenant', d.tenant],
    ['TIN', tin]
  ].filter(([, v]) => v).map(([k, v]) => `<span class="chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('');
  return `<div class="result-card">
    <div class="rc-head"><span class="rc-type">Entity</span><span class="rc-title">${esc(d.displayName)}</span>${scoreTag(d.score)}</div>
    ${highlightsToHtml(d.highlights)}
    <div class="rc-chips">${chips}</div>
  </div>`;
}

function documentCard(d) {
  const chips = [
    ['Type', d.documentType],
    ['Sub-type', d.documentSubType],
    ['Uploaded by', d.uploadedBy],
    ['Ingested', fmtEpoch(d.ingestionDate)]
  ].filter(([, v]) => v).map(([k, v]) => `<span class="chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('');
  return `<div class="result-card">
    <div class="rc-head"><span class="rc-type">Document</span><span class="rc-title">${esc(d.documentName)}</span>${scoreTag(d.score)}</div>
    ${highlightsToHtml(d.highlights)}
    <div class="rc-chips">${chips}</div>
    <div class="rc-actions"><button class="btn btn-ghost mlt-btn" data-collection="document_center_entity" data-id="${esc(d.documentGUID)}">Find similar</button></div>
  </div>`;
}

function taskCard(d) {
  const chips = [
    ['Case', d.caseDisplayId],
    ['Status', d.internalTaskStatus],
    ['Type', d.taskType],
    ['Assignee', d.assignee]
  ].filter(([, v]) => v).map(([k, v]) => `<span class="chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('');
  return `<div class="result-card">
    <div class="rc-head"><span class="rc-type">Task</span><span class="rc-title">${esc(d.taskName)}</span>${scoreTag(d.score)}</div>
    ${d.description ? `<div class="rc-sub">${esc(d.description)}</div>` : ''}
    ${highlightsToHtml(d.highlights)}
    <div class="rc-chips">${chips}</div>
  </div>`;
}

function auditCard(d) {
  const chips = [
    ['Event', d.event],
    ['App', d.application],
    ['Scope', d.scope],
    ['Author', d.author],
    ['When', fmtEpoch(d.timestamp)]
  ].filter(([, v]) => v).map(([k, v]) => `<span class="chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('');
  return `<div class="result-card">
    <div class="rc-head"><span class="rc-type">Audit</span><span class="rc-title">${esc(d.description || d.event)}</span>${scoreTag(d.score)}</div>
    ${highlightsToHtml(d.highlights)}
    <div class="rc-chips">${chips}</div>
  </div>`;
}

const CARD = { cases: caseCard, entities: entityCard, documents: documentCard, tasks: taskCard, audit: auditCard };

// -------------------- rendering: facets --------------------
function renderFacets(tab, facets) {
  const rail = $('facetRail');
  const labels = FACET_LABELS[tab];
  if (!labels || !facets) { rail.innerHTML = ''; return; }
  const groups = Object.entries(labels).map(([key, label]) => {
    const buckets = facets[key] || [];
    if (!buckets.length) return '';
    const active = state.filters[key];
    const opts = buckets.map((b) => {
      const isActive = active === b.value;
      return `<div class="facet-opt ${isActive ? 'active' : ''}" data-facet="${esc(key)}" data-value="${esc(b.value)}">
        <span>${esc(b.value)}</span><span class="fcount">${b.count}</span>
      </div>`;
    }).join('');
    const clear = active ? `<div class="facet-opt" data-facet="${esc(key)}" data-value=""><span class="muted">Clear</span></div>` : '';
    return `<div class="facet-group"><h3>${esc(label)}</h3>${opts}${clear}</div>`;
  }).join('');
  rail.innerHTML = groups || '<div class="facet-empty">No facets.</div>';
}

// -------------------- search runners --------------------
function connWarning() {
  return `<div class="notice"><b>No connection set.</b> Open the ⚙ connection panel above, or set it on the
    <a href="/index.html">Setup page</a> first.</div>`;
}
function searchUnavailableNotice() {
  return `<div class="notice"><b>Atlas Search not available.</b> The <code>$search</code> stage failed —
    make sure you clicked <b>Create Atlas Search indexes</b> on the Setup page and that this is an Atlas
    cluster (or local Atlas). Indexes also take a minute to become queryable after creation.</div>`;
}

async function runSearch() {
  const results = $('results');
  const { uri, dbName } = conn();
  if (!uri || !dbName) { state.lastPipelines = []; results.innerHTML = connWarning(); $('facetRail').innerHTML = ''; applyPipelinePanel(); return; }

  results.innerHTML = '<p class="muted">Searching…</p>';

  try {
    if (state.tab === 'all') return await runGlobal();
    return await runTab();
  } catch (e) {
    if (e.message === 'NO_CONN') { results.innerHTML = connWarning(); return; }
    results.innerHTML = `<div class="notice">${esc(e.message)}</div>`;
  }
}

async function runGlobal() {
  const results = $('results');
  $('facetRail').innerHTML = '';
  if (!state.query.trim()) {
    state.lastPipelines = [];
    results.innerHTML = `<div class="empty-state"><p class="muted">Type a query to search across all collections.</p></div>`;
    applyPipelinePanel();
    return;
  }
  const r = await api('/api/search/global', { query: state.query });
  state.lastPipelines = r.pipelines || [];
  if (r.searchUnavailable) { results.innerHTML = searchUnavailableNotice(); applyPipelinePanel(); return; }

  const cardFor = { Case: caseCard, Entity: entityCard, Document: documentCard, Task: taskCard };
  const blocks = r.groups.filter((g) => g.hits.length).map((g) => {
    const cards = g.hits.map((h) => cardFor[g.type](h.doc)).join('');
    return `<div class="group-header">${esc(g.type)}s <span class="gcount muted">(${g.hits.length})</span></div>${cards}`;
  }).join('');
  results.innerHTML = blocks || `<div class="empty-state"><p class="muted">No matches for “${esc(state.query)}”.</p></div>`;
  applyPipelinePanel();
  bindMlt();
}

async function runTab() {
  const results = $('results');
  const body = { query: state.query, page: state.page, limit: state.limit, ...state.filters };
  if (state.tab === 'cases') body.sort = state.sort;
  const r = await api(TAB_ENDPOINT[state.tab], body);
  state.lastPipelines = r.pipelines || [];

  if (r.searchUnavailable) { results.innerHTML = searchUnavailableNotice(); $('facetRail').innerHTML = ''; applyPipelinePanel(); return; }
  if (!r.ok) { results.innerHTML = `<div class="notice">${esc(r.error || 'Search failed')}</div>`; applyPipelinePanel(); return; }

  renderFacets(state.tab, r.facets);

  const sortCtl = state.tab === 'cases'
    ? `<select id="sortSel"><option value="relevance">Sort: Relevance</option><option value="newest">Sort: Newest</option></select>`
    : '';
  const head = `<div class="results-head">
    <span class="count">${(r.total ?? r.hits.length).toLocaleString()} result${r.total === 1 ? '' : 's'}</span>
    ${sortCtl}
  </div>`;

  const cards = r.hits.length
    ? r.hits.map((d) => CARD[state.tab](d)).join('')
    : `<div class="empty-state"><p class="muted">No matches.</p></div>`;

  const totalPages = Math.ceil((r.total ?? r.hits.length) / state.limit);
  const pager = totalPages > 1 ? `<div class="pager">
    <button class="btn btn-ghost" id="prevPage" ${state.page === 0 ? 'disabled' : ''}>Prev</button>
    <span class="muted">Page ${state.page + 1} of ${totalPages}</span>
    <button class="btn btn-ghost" id="nextPage" ${state.page + 1 >= totalPages ? 'disabled' : ''}>Next</button>
  </div>` : '';

  results.innerHTML = head + cards + pager;
  applyPipelinePanel();

  const sel = $('sortSel');
  if (sel) { sel.value = state.sort; sel.addEventListener('change', () => { state.sort = sel.value; state.page = 0; runSearch(); }); }
  const prev = $('prevPage'); if (prev) prev.addEventListener('click', () => { state.page--; runSearch(); });
  const next = $('nextPage'); if (next) next.addEventListener('click', () => { state.page++; runSearch(); });
  bindMlt();
}

// -------------------- pipeline viewer --------------------
function pipelineSnippet(p) {
  return `db.getCollection(${JSON.stringify(p.collection)}).aggregate(\n${JSON.stringify(p.pipeline, null, 2)}\n)`;
}
function applyPipelinePanel() {
  const results = $('results');
  const existing = document.getElementById('pipelinePanel');
  if (existing) existing.remove();
  if (!state.showPipeline || !state.lastPipelines.length) return;

  const blocks = state.lastPipelines.map((p, i) => `
    <div class="pipeline-block">
      <div class="pb-head">
        <span class="pb-label">${esc(p.label || 'Pipeline')} · <code>${esc(p.collection)}</code></span>
        <button class="btn btn-ghost pb-copy" data-i="${i}">Copy</button>
      </div>
      <pre>${esc(pipelineSnippet(p))}</pre>
    </div>`).join('');

  const panel = document.createElement('div');
  panel.className = 'pipeline-panel';
  panel.id = 'pipelinePanel';
  panel.innerHTML = `<h3>Aggregation pipeline${state.lastPipelines.length > 1 ? 's' : ''} executed</h3>${blocks}`;
  results.insertBefore(panel, results.firstChild);

  panel.querySelectorAll('.pb-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = state.lastPipelines[+btn.dataset.i];
      try {
        await navigator.clipboard.writeText(pipelineSnippet(p));
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    });
  });
}

// -------------------- more like this --------------------
function bindMlt() {
  document.querySelectorAll('.mlt-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const collection = btn.dataset.collection;
      const id = btn.dataset.id;
      openMlt(collection, id);
    });
  });
}
async function openMlt(collection, id) {
  $('mltBackdrop').classList.add('show');
  $('mltBody').innerHTML = '<p class="muted">Finding similar…</p>';
  try {
    const r = await api('/api/search/more-like-this', { collection, id });
    if (!r.ok) { $('mltBody').innerHTML = `<div class="notice">${esc(r.error || 'Failed')}</div>`; return; }
    const isCase = collection === 'case_entity';
    const cards = (r.hits || []).map((d) => isCase ? caseCard(d) : documentCard(d)).join('');
    $('mltBody').innerHTML = cards || '<p class="muted">No similar records found.</p>';
    bindMlt();
  } catch (e) {
    $('mltBody').innerHTML = `<div class="notice">${esc(e.message)}</div>`;
  }
}

// -------------------- autocomplete --------------------
let acTimer = null;
let acIndex = -1;
function hideAc() { $('acDropdown').classList.remove('show'); acIndex = -1; }
async function runAutocomplete() {
  const q = $('q').value.trim();
  if (q.length < 2 || !conn().uri) { hideAc(); return; }
  try {
    const r = await api('/api/search/autocomplete', { query: q });
    if (!r.suggestions?.length) { hideAc(); return; }
    $('acDropdown').innerHTML = r.suggestions.map((s, i) => `
      <div class="ac-item" data-i="${i}" data-label="${esc(s.label)}">
        <span class="ac-type">${esc(s.type)}</span>
        <span class="ac-label">${esc(s.label)}</span>
        ${s.sub ? `<span class="ac-sub">${esc(s.sub)}</span>` : ''}
      </div>`).join('');
    $('acDropdown').classList.add('show');
    acIndex = -1;
    document.querySelectorAll('.ac-item').forEach((el) => {
      el.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        $('q').value = el.dataset.label;
        state.query = el.dataset.label;
        hideAc();
        state.page = 0;
        runSearch();
      });
    });
  } catch { hideAc(); }
}
function moveAc(dir) {
  const items = [...document.querySelectorAll('.ac-item')];
  if (!items.length) return;
  acIndex = (acIndex + dir + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
}

// -------------------- events --------------------
function submitSearch() {
  state.query = $('q').value.trim();
  state.page = 0;
  hideAc();
  runSearch();
}

$('btnSearch').addEventListener('click', submitSearch);
$('q').addEventListener('input', () => { clearTimeout(acTimer); acTimer = setTimeout(runAutocomplete, 180); });
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveAc(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveAc(-1); }
  else if (e.key === 'Enter') {
    const items = [...document.querySelectorAll('.ac-item')];
    if (acIndex >= 0 && items[acIndex]) { $('q').value = items[acIndex].dataset.label; }
    submitSearch();
  } else if (e.key === 'Escape') { hideAc(); }
});
$('q').addEventListener('blur', () => setTimeout(hideAc, 150));

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  state.tab = btn.dataset.tab;
  state.filters = {};
  state.page = 0;
  state.sort = 'relevance';
  runSearch();
});

$('facetRail').addEventListener('click', (e) => {
  const opt = e.target.closest('.facet-opt');
  if (!opt) return;
  const key = opt.dataset.facet;
  const value = opt.dataset.value;
  if (value === '' || state.filters[key] === value) delete state.filters[key];
  else state.filters[key] = value;
  state.page = 0;
  runSearch();
});

$('pipeToggle').addEventListener('change', (e) => {
  state.showPipeline = e.target.checked;
  applyPipelinePanel();
});

$('btnConn').addEventListener('click', () => $('connPanel').classList.toggle('show'));
$('btnSaveConn').addEventListener('click', () => {
  saveConn();
  $('connPanel').classList.remove('show');
  runSearch();
});
$('mltClose').addEventListener('click', () => $('mltBackdrop').classList.remove('show'));
$('mltBackdrop').addEventListener('click', (e) => { if (e.target === $('mltBackdrop')) $('mltBackdrop').classList.remove('show'); });

loadConn();
if (!conn().uri) $('connPanel').classList.add('show');
