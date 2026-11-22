// MongoDB Atlas store: documents + Atlas Vector Search + Atlas Search (keywords).
import { MongoClient } from 'mongodb';

const VECTOR_INDEX = 'chunk_vector';
const TEXT_INDEX = 'chunk_text';
const strip = ({ _id, embedding, repoKey, ...rest }) => rest;

export async function createMongoStore(uri, dbName) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const repos = db.collection('repos'), files = db.collection('files'), chunks = db.collection('chunks');

  async function ensureSearchIndex(name, spec) {
    const existing = await chunks.listSearchIndexes().toArray();
    if (existing.some((i) => i.name === name)) return;
    await chunks.createSearchIndex({ name, ...spec });
    console.log(`Created Atlas search index "${name}" (takes ~1 minute to become ready)`);
  }

  return {
    kind: 'mongo',
    async init(dims) {
      await repos.createIndex({ key: 1 }, { unique: true });
      await files.createIndex({ repoKey: 1, path: 1 });
      await chunks.createIndex({ repoKey: 1, strategy: 1 });
      await db.createCollection('chunks').catch(() => {}); // search indexes need the collection to exist
      await ensureSearchIndex(VECTOR_INDEX, {
        type: 'vectorSearch',
        definition: { fields: [
          { type: 'vector', path: 'embedding', numDimensions: dims, similarity: 'cosine' },
          { type: 'filter', path: 'repoKey' },
          { type: 'filter', path: 'strategy' }
        ] }
      });
      await ensureSearchIndex(TEXT_INDEX, {
        definition: { mappings: { dynamic: false, fields: {
          text: { type: 'string' }, symbol: { type: 'string' }, path: { type: 'string' },
          repoKey: { type: 'token' }, strategy: { type: 'token' }
        } } }
      });
    },

    async upsertRepo(key, patch) { await repos.updateOne({ key }, { $set: { ...patch, updatedAt: new Date() } }, { upsert: true }); },
    async getRepo(key) { const r = await repos.findOne({ key }); if (r) delete r._id; return r; },
    async listRepos() { return (await repos.find({}, { projection: { _id: 0 } }).toArray()); },

    async saveFiles(key, list) {
      await files.deleteMany({ repoKey: key });
      for (let i = 0; i < list.length; i += 200) {
        await files.insertMany(list.slice(i, i + 200).map((f) => ({ repoKey: key, path: f.path, content: f.content })));
      }
    },
    async getFile(key, path) { return (await files.findOne({ repoKey: key, path }))?.content ?? null; },

    async replaceChunks(key, strategy, list) {
      await chunks.deleteMany({ repoKey: key, strategy });
      for (let i = 0; i < list.length; i += 300) {
        await chunks.insertMany(list.slice(i, i + 300).map((c) => ({ ...c, repoKey: key, strategy })));
      }
    },

    async vectorSearch(key, strategy, vector, k) {
      const rows = await chunks.aggregate([
        { $vectorSearch: {
            index: VECTOR_INDEX, path: 'embedding', queryVector: vector,
            numCandidates: Math.max(100, k * 20), limit: k,
            filter: { $and: [{ repoKey: { $eq: key } }, { strategy: { $eq: strategy } }] } } },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
        { $project: { embedding: 0 } }
      ]).toArray();
      return rows.map(strip).map((r, i) => ({ ...r, score: rows[i].score }));
    },

    async textSearch(key, strategy, query, k) {
      const rows = await chunks.aggregate([
        { $search: { index: TEXT_INDEX, compound: {
            must: [{ text: { query, path: ['text', 'symbol', 'path'] } }],
            filter: [{ equals: { path: 'repoKey', value: key } }, { equals: { path: 'strategy', value: strategy } }] } } },
        { $limit: k },
        { $addFields: { score: { $meta: 'searchScore' } } },
        { $project: { embedding: 0 } }
      ]).toArray();
      return rows.map(strip).map((r, i) => ({ ...r, score: rows[i].score }));
    }
  };
}
