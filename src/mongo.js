import { MongoClient } from 'mongodb';
import { COLLECTIONS } from './schemas.js';
import { buildDataset } from './generators.js';

/**
 * Connect to MongoDB and return the client + database handle.
 * Caller is responsible for closing the client.
 */
export async function connect(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(dbName);
  // Force a round-trip so a bad URI fails fast with a clear error.
  await db.command({ ping: 1 });
  return { client, db };
}

// Cache one connected client per URI so interactive search queries reuse pools.
const clientCache = new Map();

/** Return a pooled database handle, reused across requests for the same URI. */
export async function getDb(uri, dbName) {
  let client = clientCache.get(uri);
  if (!client) {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 });
    await client.connect();
    clientCache.set(uri, client);
  }
  return client.db(dbName);
}

/** Verify the connection works and report basic server info. */
export async function testConnection(uri, dbName) {
  const { client, db } = await connect(uri, dbName);
  try {
    const info = await db.admin().serverStatus().catch(() => null);
    return {
      ok: true,
      dbName,
      host: info?.host ?? 'unknown',
      version: info?.version ?? 'unknown'
    };
  } finally {
    await client.close();
  }
}

/**
 * Create (if needed) and seed every collection with synthetic data.
 * Existing documents are dropped first so re-runs are idempotent.
 */
export async function seedCollections(uri, dbName, overrides = {}) {
  const { client, db } = await connect(uri, dbName);
  const results = [];
  try {
    const dataset = buildDataset(overrides);
    for (const { name, seedable } of COLLECTIONS) {
      if (!seedable) {
        results.push({ collection: name, status: 'skipped', inserted: 0 });
        continue;
      }
      const docs = dataset[name] ?? [];
      const coll = db.collection(name);
      await coll.deleteMany({});
      if (docs.length > 0) {
        await coll.insertMany(docs, { ordered: false });
      }
      results.push({ collection: name, status: 'seeded', inserted: docs.length });
    }
    return { ok: true, results };
  } finally {
    await client.close();
  }
}

/** Create the regular (b-tree) indexes for every collection. */
export async function createIndexes(uri, dbName) {
  const { client, db } = await connect(uri, dbName);
  const results = [];
  try {
    for (const { name, indexes } of COLLECTIONS) {
      const coll = db.collection(name);
      // Ensure the collection exists before indexing.
      await db.createCollection(name).catch((e) => {
        if (e.codeName !== 'NamespaceExists') throw e;
      });
      const created = [];
      for (const spec of indexes ?? []) {
        try {
          const idxName = await coll.createIndex(spec.key, spec.options ?? {});
          created.push(idxName);
        } catch (e) {
          created.push(`ERROR(${spec.options?.name ?? JSON.stringify(spec.key)}): ${e.message}`);
        }
      }
      results.push({ collection: name, status: 'ok', indexes: created });
    }
    return { ok: true, results };
  } finally {
    await client.close();
  }
}

/**
 * Create the Atlas Search indexes (MongoDB equivalent of the ES mappings).
 * Requires an Atlas cluster or a local Atlas deployment with a search node.
 * Failures are reported per-collection instead of aborting the whole run.
 */
export async function createSearchIndexes(uri, dbName) {
  const { client, db } = await connect(uri, dbName);
  const results = [];
  try {
    for (const { name, searchIndex } of COLLECTIONS) {
      if (!searchIndex) {
        results.push({ collection: name, status: 'skipped', message: 'no search index defined' });
        continue;
      }
      const coll = db.collection(name);
      await db.createCollection(name).catch((e) => {
        if (e.codeName !== 'NamespaceExists') throw e;
      });

      try {
        // Drop an existing index with the same name so re-runs are idempotent.
        const existing = await coll.listSearchIndexes().toArray().catch(() => []);
        if (existing.some((i) => i.name === searchIndex.name)) {
          await coll.dropSearchIndex(searchIndex.name).catch(() => {});
        }
        await coll.createSearchIndex(searchIndex);
        results.push({ collection: name, status: 'created', indexName: searchIndex.name });
      } catch (e) {
        results.push({ collection: name, status: 'error', indexName: searchIndex.name, message: e.message });
      }
    }
    const anyCreated = results.some((r) => r.status === 'created');
    return { ok: anyCreated, results };
  } finally {
    await client.close();
  }
}

/** Return document counts and index summaries for the dashboard/inspection view. */
export async function getStats(uri, dbName) {
  const { client, db } = await connect(uri, dbName);
  const results = [];
  try {
    for (const { name } of COLLECTIONS) {
      const coll = db.collection(name);
      const count = await coll.countDocuments().catch(() => 0);
      const indexes = await coll.indexes().catch(() => []);
      let searchIndexes = [];
      try {
        searchIndexes = await coll.listSearchIndexes().toArray();
      } catch {
        searchIndexes = [];
      }
      results.push({
        collection: name,
        count,
        indexes: indexes.map((i) => i.name),
        searchIndexes: searchIndexes.map((i) => ({ name: i.name, status: i.status ?? i.queryable }))
      });
    }
    return { ok: true, results };
  } finally {
    await client.close();
  }
}
