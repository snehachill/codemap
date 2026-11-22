// In-memory store: zero setup, forgets everything on restart. Same interface as the Mongo store.
import { keywords } from '../util/text.js';

const count = (hay, needle) => hay.split(needle).length - 1;
const strip = ({ embedding, repoKey, ...rest }) => rest;

export function createMemoryStore() {
  const repos = new Map(), fileMap = new Map(), chunkMap = new Map();
  return {
    kind: 'memory',
    async init() {},
    async upsertRepo(key, patch) { repos.set(key, { ...(repos.get(key) || { key }), ...patch, updatedAt: new Date() }); },
    async getRepo(key) { return repos.get(key) || null; },
    async listRepos() { return [...repos.values()]; },
    async saveFiles(key, files) { fileMap.set(key, new Map(files.map((f) => [f.path, f.content]))); },
    async getFile(key, path) { return fileMap.get(key)?.get(path) ?? null; },
    async replaceChunks(key, strategy, chunks) { chunkMap.set(`${key}#${strategy}`, chunks); },

    async vectorSearch(key, strategy, vector, k) {
      const all = chunkMap.get(`${key}#${strategy}`) || [];
      return all
        .map((c) => ({ ...strip(c), score: c.embedding.reduce((s, x, i) => s + x * vector[i], 0) })) // vectors are normalized: dot = cosine
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },

    async textSearch(key, strategy, query, k) {
      const toks = keywords(query);
      if (!toks.length) return [];
      const all = chunkMap.get(`${key}#${strategy}`) || [];
      return all
        .map((c) => {
          const sym = (c.symbol || '').toLowerCase(), p = c.path.toLowerCase(), t = c.text.toLowerCase();
          const score = toks.reduce((s, tok) => s + 3 * count(sym, tok) + 2 * count(p, tok) + count(t, tok), 0);
          return { ...strip(c), score };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    }
  };
}
