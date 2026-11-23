// Background job: GitHub URL -> files -> chunks + graph -> embeddings -> store. Updates `status` as it goes.
import { parseRepoUrl, getRepoInfo, downloadFiles } from '../ingest/github.js';
import { languageOf, isTestPath } from '../ingest/filter.js';
import { config } from '../config.js';
import { buildTree } from '../ingest/tree.js';
import { analyzeFiles } from '../parse/index.js';
import { chunkFixed } from '../parse/chunker.js';
import { embedTexts, chunkToInput } from '../embed/index.js';

const BUSY = new Set(['queued', 'fetching', 'parsing', 'embedding']);
const STALE_MS = 10 * 60 * 1000; // a job silent for 10 minutes is treated as dead
export const repoKeyOf = (owner, repo) => `${owner}/${repo}`.toLowerCase();

// strategies: 'ast' is what the app uses; add 'fixed' only for the evaluation experiment.
export async function startIndexing(store, url, { strategies = ['ast'] } = {}) {
  const ref = parseRepoUrl(url);
  const key = repoKeyOf(ref.owner, ref.repo);
  const existing = await store.getRepo(key);

  // A job that stopped (server restart, crash) leaves its status stuck. If it has been silent too long, allow a restart.
  const stale = existing?.updatedAt && Date.now() - new Date(existing.updatedAt).getTime() > STALE_MS;
  if (existing && BUSY.has(existing.status) && !stale) return { key, done: Promise.resolve(key) };

  await store.upsertRepo(key, { url, status: 'queued', error: null, progress: null });
  const done = run(store, key, ref, strategies, existing)
    .catch((err) => {
      console.error(`[index] FAILED ${key}:`, err.message);
      return store.upsertRepo(key, { status: 'error', error: err.message }).catch(() => {});
    })
    .then(() => key);
  return { key, done };
}

async function run(store, key, ref, strategies, existing) {
  const t0 = Date.now();
  const lap = (label) => console.log(`[index] ${key} | ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const info = await getRepoInfo(ref);
  lap('repo info');

  const upToDate = existing?.status === 'ready' && info.sha !== 'HEAD' && existing.info?.sha === info.sha
    && strategies.every((s) => existing.strategies?.includes(s));
  if (upToDate) { lap('already indexed at this commit'); return store.upsertRepo(key, { status: 'ready' }); } // same commit already indexed

  await store.upsertRepo(key, { status: 'fetching', info });
  const { files, skipped } = await downloadFiles(info);
  lap(`downloaded ${files.length} files`);

  await store.upsertRepo(key, { status: 'parsing' });
  const { chunks, graph, externals } = await analyzeFiles(files);
  lap(`parsed ${chunks.length} chunks, ${graph.edges.length} import links`);
  const searchable = (c) => config.indexTests || !isTestPath(c.path);
  const sets = {};
  if (strategies.includes('ast')) sets.ast = chunks.filter(searchable);
  if (strategies.includes('fixed')) sets.fixed = files.flatMap((f) => chunkFixed(f)).filter(searchable);

  const languages = {};
  for (const f of files) { const l = languageOf(f.path); languages[l] = (languages[l] || 0) + 1; }

  await store.saveFiles(key, files);
  lap('saved files to MongoDB');
  const total = Object.values(sets).reduce((n, c) => n + c.length, 0);
  // Tree and graph are usable right now, even before embedding finishes.
  await store.upsertRepo(key, {
    status: 'embedding', tree: buildTree(files), graph, externals,
    stats: { fileCount: files.length, chunkCount: sets.ast?.length ?? chunks.length, edgeCount: graph.edges.length, languages, skipped },
    progress: { done: 0, total }
  });
  lap(`embedding ${total} chunks`);

  let done = 0;
  let batchNo = 0;
  for (const [strategy, list] of Object.entries(sets)) {
    const withVectors = [];
    for (let i = 0; i < list.length; i += 32) {
      const batch = list.slice(i, i + 32);
      const vectors = await embedTexts(batch.map(chunkToInput));
      batch.forEach((c, j) => withVectors.push({ ...c, embedding: vectors[j] }));
      done += batch.length;
      batchNo++;
      await store.upsertRepo(key, { progress: { done, total } });
      if (batchNo === 1) lap(`first batch embedded (${batch.length} chunks)`); // shows whether the model loaded
      else if (batchNo % 10 === 0) lap(`embedded ${done}/${total}`);          // progress every 10 batches
    }
    lap(`embedding finished (${withVectors.length} ${strategy} chunks)`);    // NEW: embedding time ends here
    await store.replaceChunks(key, strategy, withVectors);
    lap(`stored ${withVectors.length} ${strategy} chunks`);                  // saving time = this minus the line above
  }
  await store.upsertRepo(key, { status: 'ready', strategies: Object.keys(sets), progress: null, indexedAt: new Date() });
  lap('done');
}
