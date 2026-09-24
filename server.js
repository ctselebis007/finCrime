import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  testConnection,
  seedCollections,
  createIndexes,
  createSearchIndexes,
  getStats
} from './src/mongo.js';
import {
  globalSearch,
  searchCases,
  searchEntities,
  searchDocuments,
  searchTasks,
  searchAudit,
  autocomplete,
  moreLikeThis
} from './src/search.js';
import { COLLECTIONS } from './src/schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Small wrapper so async route errors return JSON instead of crashing.
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  });
};

function requireConn(req, res) {
  const { uri, dbName } = req.body ?? {};
  if (!uri || !dbName) {
    res.status(400).json({ ok: false, error: 'uri and dbName are required' });
    return null;
  }
  return { uri, dbName };
}

app.get('/api/collections', (_req, res) => {
  res.json({
    ok: true,
    collections: COLLECTIONS.map((c) => ({ name: c.name, description: c.description }))
  });
});

app.post('/api/test-connection', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  const result = await testConnection(conn.uri, conn.dbName);
  res.json(result);
}));

app.post('/api/seed', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  const result = await seedCollections(conn.uri, conn.dbName, req.body.counts ?? {});
  res.json(result);
}));

app.post('/api/create-indexes', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  const result = await createIndexes(conn.uri, conn.dbName);
  res.json(result);
}));

app.post('/api/create-search-indexes', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  const result = await createSearchIndexes(conn.uri, conn.dbName);
  res.json(result);
}));

app.post('/api/stats', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  const result = await getStats(conn.uri, conn.dbName);
  res.json(result);
}));

// --- Search endpoints ---

app.post('/api/search/global', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await globalSearch(conn.uri, conn.dbName, req.body));
}));

app.post('/api/search/cases', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await searchCases(conn.uri, conn.dbName, req.body));
}));

app.post('/api/search/entities', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await searchEntities(conn.uri, conn.dbName, req.body));
}));

app.post('/api/search/documents', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await searchDocuments(conn.uri, conn.dbName, req.body));
}));

app.post('/api/search/tasks', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await searchTasks(conn.uri, conn.dbName, req.body));
}));

app.post('/api/search/audit', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await searchAudit(conn.uri, conn.dbName, req.body));
}));

app.post('/api/search/autocomplete', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await autocomplete(conn.uri, conn.dbName, req.body));
}));

app.post('/api/search/more-like-this', wrap(async (req, res) => {
  const conn = requireConn(req, res);
  if (!conn) return;
  res.json(await moreLikeThis(conn.uri, conn.dbName, req.body));
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FinCrime synthetic data app running at http://localhost:${PORT}`);
});
