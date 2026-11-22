// Tests download -> parse -> chunks -> graph WITHOUT the GitHub REST API.
//   node scripts/test-offline.js owner repo
import { downloadFiles } from '../src/ingest/github.js';
import { analyzeFiles } from '../src/parse/index.js';
import { chunkFixed } from '../src/parse/chunker.js';

const [owner = 'expressjs', repo = 'express'] = process.argv.slice(2);
const { files } = await downloadFiles({ owner, repo, sha: 'HEAD' });
const { chunks, graph, externals } = await analyzeFiles(files);

console.log(`files: ${files.length}  | AST chunks: ${chunks.length}  | naive chunks: ${files.flatMap((f) => chunkFixed(f)).length}`);
console.log(`graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

console.log('\nMost imported files:');
[...graph.nodes].sort((a, b) => b.importedBy - a.importedBy).slice(0, 5)
  .forEach((n) => console.log(`  ${String(n.importedBy).padStart(3)}  ${n.id}`));

console.log('\nTop external packages:', Object.entries(externals).sort((a, b) => b[1] - a[1]).slice(0, 5));

const sample = chunks.find((c) => c.kind === 'function' && c.path.startsWith('lib/'));
console.log(`\nSample chunk -> ${sample.path}:${sample.startLine}-${sample.endLine}  [${sample.kind}: ${sample.symbol}]`);
console.log(sample.text.split('\n').slice(0, 6).join('\n'));
