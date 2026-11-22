// The experiment for your report: does AST chunking + hybrid search retrieve better than naive chunking?
//   node scripts/evaluate.js expressjs/express eval/golden.express.json
import fs from 'node:fs';
import { createStore } from '../src/store/index.js';
import { startIndexing } from '../src/jobs/indexer.js';
import { retrieve } from '../src/rag/retrieve.js';

const [repoArg = 'expressjs/express', goldenPath = 'eval/golden.express.json'] = process.argv.slice(2);
const K = 5;
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

const store = await createStore();
console.log('Indexing with both chunking strategies (first run can take a few minutes)...');
const { key, done } = await startIndexing(store, `https://github.com/${repoArg}`, { strategies: ['ast', 'fixed'] });
await done;
const repo = await store.getRepo(key);
if (repo.status !== 'ready') throw new Error(`Indexing failed: ${repo.error}`);

const configs = [
  { name: 'Fixed chunks + vector', strategy: 'fixed', mode: 'vector' },
  { name: 'AST chunks + vector', strategy: 'ast', mode: 'vector' },
  { name: 'AST chunks + hybrid', strategy: 'ast', mode: 'hybrid' }
];

const results = [];
for (const cfg of configs) {
  let hit = 0, prec = 0, mrr = 0;
  const perQuestion = [];
  for (const q of golden) {
    const { chunks } = await retrieve(store, key, q.question, { k: K, strategy: cfg.strategy, mode: cfg.mode });
    const relevant = chunks.map((c) => q.expectedFiles.includes(c.path));
    const firstHit = relevant.indexOf(true);
    hit += firstHit >= 0 ? 1 : 0;                                   // Hit@K: any expected file in top K?
    prec += relevant.filter(Boolean).length / K;                    // Precision@K: share of top K that is relevant
    mrr += firstHit >= 0 ? 1 / (firstHit + 1) : 0;                  // MRR: how high is the first relevant chunk?
    perQuestion.push({ question: q.question, firstRelevantRank: firstHit >= 0 ? firstHit + 1 : null });
  }
  const n = golden.length;
  results.push({ ...cfg, hitAtK: hit / n, precisionAtK: prec / n, mrr: mrr / n, perQuestion });
}

console.log(`\nResults on ${repoArg} (${golden.length} questions, K=${K}, embeddings: ${process.env.EMBEDDINGS_PROVIDER || 'local'})\n`);
console.log('Strategy'.padEnd(26) + 'Hit@5'.padEnd(10) + 'Precision@5'.padEnd(14) + 'MRR');
for (const r of results) {
  console.log(r.name.padEnd(26) + r.hitAtK.toFixed(2).padEnd(10) + r.precisionAtK.toFixed(2).padEnd(14) + r.mrr.toFixed(2));
}
fs.writeFileSync('eval/results.json', JSON.stringify(results, null, 2));
console.log('\nSaved eval/results.json (use it for the charts in your report)');
process.exit(0);
