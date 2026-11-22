// Finds the chunks most relevant to a question: vector search + keyword search, merged.
import { config } from '../config.js';
import { embedTexts } from '../embed/index.js';
import { extractIdentifiers } from '../util/text.js';

const idOf = (c) => `${c.path}:${c.startLine}-${c.endLine}`;

// Reciprocal Rank Fusion: a chunk ranked high in either list ends up high overall.
function fuse(lists, k = 60) {
  const merged = new Map();
  for (const list of lists) {
    list.forEach((c, rank) => {
      const entry = merged.get(idOf(c)) || { ...c, rrf: 0 };
      entry.rrf += 1 / (k + rank + 1);
      if (c.vectorScore !== undefined) entry.vectorScore = c.vectorScore;
      merged.set(idOf(c), entry);
    });
  }
  return [...merged.values()].sort((a, b) => b.rrf - a.rrf);
}

// mode: 'vector' (meaning only) | 'hybrid' (meaning + exact words/identifiers)
export async function retrieve(store, repoKey, question, { k = config.retrieval.topK, strategy = 'ast', mode = 'hybrid' } = {}) {
  const [queryVector] = await embedTexts([question]);
  const pool = k * 3;

  const vec = (await store.vectorSearch(repoKey, strategy, queryVector, pool)).map((c) => ({ ...c, vectorScore: c.score }));
  const topVectorScore = vec[0]?.vectorScore ?? 0;

  if (mode === 'vector') return { chunks: vec.slice(0, k), topVectorScore, keywordHits: 0 };

  // Keyword search only helps when the question names something exact (app.use, requireAuth, auth.js).
  const ids = extractIdentifiers(question);
  if (!ids.length) return { chunks: vec.slice(0, k), topVectorScore, keywordHits: 0 };
  const txt = await store.textSearch(repoKey, strategy, ids.join(' '), pool);
  return { chunks: fuse([vec, txt]).slice(0, k), topVectorScore, keywordHits: txt.length };
}
