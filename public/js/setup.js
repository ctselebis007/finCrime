const $ = (id) => document.getElementById(id);

const STORE_KEY = 'fincrime.conn';

function loadConn() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}');
    if (saved.uri) $('uri').value = saved.uri;
    if (saved.dbName) $('dbName').value = saved.dbName;
  } catch { /* ignore */ }
}

function conn() {
  const uri = $('uri').value.trim();
  const dbName = $('dbName').value.trim();
  sessionStorage.setItem(STORE_KEY, JSON.stringify({ uri, dbName }));
  return { uri, dbName };
}

function setStatus(el, kind, msg) {
  el.className = `status show ${kind}`;
  el.textContent = msg;
}

function busy(btn, on, label) {
  if (on) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${label || 'Working…'}`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || label;
  }
}

async function api(pathname, extra = {}) {
  const { uri, dbName } = conn();
  if (!uri || !dbName) throw new Error('Enter a MongoDB URI and database name first.');
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri, dbName, ...extra })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// --- Test connection ---
$('btnTest').addEventListener('click', async () => {
  const btn = $('btnTest');
  const el = $('statusConn');
  try {
    busy(btn, true, 'Testing…');
    setStatus(el, 'info', 'Connecting…');
    const r = await api('/api/test-connection');
    setStatus(el, 'ok', `Connected to "${r.dbName}"  ·  MongoDB ${r.version}  ·  ${r.host}`);
  } catch (e) {
    setStatus(el, 'err', e.message);
  } finally {
    busy(btn, false);
  }
});

// --- Seed ---
$('btnSeed').addEventListener('click', async () => {
  const btn = $('btnSeed');
  const el = $('statusSeed');
  try {
    busy(btn, true, 'Seeding…');
    setStatus(el, 'info', 'Creating and seeding collections… this may take a moment.');
    const r = await api('/api/seed');
    const total = r.results.reduce((s, x) => s + (x.inserted || 0), 0);
    const lines = r.results.map((x) => `  • ${x.collection.padEnd(34)} ${String(x.inserted).padStart(5)}  (${x.status})`);
    setStatus(el, 'ok', `Seeded ${total.toLocaleString()} documents across ${r.results.length} collections:\n${lines.join('\n')}`);
    loadStats();
  } catch (e) {
    setStatus(el, 'err', e.message);
  } finally {
    busy(btn, false);
  }
});

// --- Regular indexes ---
$('btnIndexes').addEventListener('click', async () => {
  const btn = $('btnIndexes');
  const el = $('statusIndexes');
  try {
    busy(btn, true, 'Creating…');
    setStatus(el, 'info', 'Creating regular indexes…');
    const r = await api('/api/create-indexes');
    const lines = r.results.map((x) => `  • ${x.collection.padEnd(34)} ${x.indexes.join(', ')}`);
    setStatus(el, 'ok', `Regular indexes created:\n${lines.join('\n')}`);
    loadStats();
  } catch (e) {
    setStatus(el, 'err', e.message);
  } finally {
    busy(btn, false);
  }
});

// --- Atlas Search indexes ---
$('btnSearchIndexes').addEventListener('click', async () => {
  const btn = $('btnSearchIndexes');
  const el = $('statusIndexes');
  try {
    busy(btn, true, 'Creating…');
    setStatus(el, 'info', 'Creating Atlas Search indexes… (these build asynchronously)');
    const r = await api('/api/create-search-indexes');
    const lines = r.results.map((x) => {
      const detail = x.status === 'created' ? `→ ${x.indexName}` : x.message || x.status;
      return `  • ${x.collection.padEnd(34)} [${x.status}] ${detail}`;
    });
    const kind = r.ok ? 'ok' : 'err';
    const header = r.ok
      ? 'Atlas Search indexes submitted (allow a minute to become queryable):'
      : 'No search indexes created — is this an Atlas cluster / local Atlas with a search node?';
    setStatus(el, kind, `${header}\n${lines.join('\n')}`);
    loadStats();
  } catch (e) {
    setStatus(el, 'err', e.message);
  } finally {
    busy(btn, false);
  }
});

// --- Stats ---
function badge(status) {
  if (status === true || status === 'READY' || status === 'ACTIVE') return '<span class="badge green">ready</span>';
  if (status === 'PENDING' || status === 'BUILDING') return '<span class="badge amber">building</span>';
  if (status === false) return '<span class="badge amber">building</span>';
  if (!status) return '<span class="badge grey">—</span>';
  return `<span class="badge amber">${status}</span>`;
}

async function loadStats() {
  const wrap = $('statsWrap');
  try {
    wrap.innerHTML = '<p class="muted">Loading…</p>';
    const r = await api('/api/stats');
    const rows = r.results.map((x) => {
      const search = x.searchIndexes.length
        ? x.searchIndexes.map((s) => `${s.name} ${badge(s.status)}`).join(' ')
        : '<span class="badge grey">none</span>';
      return `<tr>
        <td>${x.collection}</td>
        <td class="num">${x.count.toLocaleString()}</td>
        <td class="num">${x.indexes.length}</td>
        <td>${search}</td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<table>
      <thead><tr><th>Collection</th><th class="num">Documents</th><th class="num">Indexes</th><th>Atlas Search</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  } catch (e) {
    wrap.innerHTML = `<p class="muted">${e.message}</p>`;
  }
}

$('btnRefresh').addEventListener('click', loadStats);

loadConn();
