// Background job: GitHub URL -> files -> chunks + graph -> embeddings -> store. Updates `status` as it goes.
import { parseRepoUrl, getRepoInfo, downloadFiles } from '../ingest/github.js';
import { languageOf, isTestPath } from '../ingest/filter.js';
import { config } from '../config.js';
import { buildTree } from '../ingest/tree.js';
import { analyzeFiles } from '../parse/index.js';
import { chunkFixed } from '../parse/chunker.js';
import { embedTexts, chunkToInput } from '../embed/index.js';

const BUSY = new Set(['queued', 'fetching', 'parsing', 'embedding']);
export const repoKeyOf = (owner, repo) => `${owner}/${repo}`.toLowerCase();

// strategies: 'ast' is what the app uses; add 'fixed' only for the evaluation experiment.
export async function startIndexing(store, url, { strategies = ['ast'] } = {}) {
  const ref = parseRepoUrl(url);
  const key = repoKeyOf(ref.owner, ref.repo);
  const existing = await store.getRepo(key);
  if (existing && BUSY.has(existing.status)) return { key, done: Promise.resolve(key) };

  await store.upsertRepo(key, { url, status: 'queued', error: null, progress: null });
  const done = run(store, key, ref, strategies, existing)
    .catch((err) => store.upsertRepo(key, { status: 'error', error: err.message }))
    .then(() => key);
  return { key, done };
}

async function run(store, key, ref, strategies, existing) {
   const t0 = Date.now();
   const lap = (label) => console.log(`[index] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
   const info = await getRepoInfo(ref);

  const upToDate = existing?.status === 'ready' && info.sha !== 'HEAD' && existing.info?.sha === info.sha
    && strategies.every((s) => existing.strategies?.includes(s));
  if (upToDate) return store.upsertRepo(key, { status: 'ready' }); // same commit already indexed

  await store.upsertRepo(key, { status: 'fetching', info });
  const { files, skipped } = await downloadFiles(info);

  await store.upsertRepo(key, { status: 'parsing' });
  const { chunks, graph, externals } = await analyzeFiles(files);
  const searchable = (c) => config.indexTests || !isTestPath(c.path);
  const sets = {};
  if (strategies.includes('ast')) sets.ast = chunks.filter(searchable);
  if (strategies.includes('fixed')) sets.fixed = files.flatMap((f) => chunkFixed(f)).filter(searchable);

  const languages = {};
  for (const f of files) { const l = languageOf(f.path); languages[l] = (languages[l] || 0) + 1; }

  await store.saveFiles(key, files);
  const total = Object.values(sets).reduce((n, c) => n + c.length, 0);
  // Tree and graph are usable right now, even before embedding finishes.
  await store.upsertRepo(key, {
    status: 'embedding', tree: buildTree(files), graph, externals,
    stats: { fileCount: files.length, chunkCount: sets.ast?.length ?? chunks.length, edgeCount: graph.edges.length, languages, skipped },
    progress: { done: 0, total }
  });

  let done = 0;
  for (const [strategy, list] of Object.entries(sets)) {
    const withVectors = [];
    for (let i = 0; i < list.length; i += 32) {
      const batch = list.slice(i, i + 32);
      const vectors = await embedTexts(batch.map(chunkToInput));
      batch.forEach((c, j) => withVectors.push({ ...c, embedding: vectors[j] }));
      done += batch.length;
      await store.upsertRepo(key, { progress: { done, total } });
    }
    await store.replaceChunks(key, strategy, withVectors);
  }
  await store.upsertRepo(key, { status: 'ready', strategies: Object.keys(sets), progress: null, indexedAt: new Date() });
}
