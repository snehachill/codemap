// Quick test without a server:  npm run try -- https://github.com/owner/repo
import { ingestRepo } from '../src/ingest/index.js';

function print(node, indent = '', depth = 0, maxDepth = 2) {
  for (const child of node.children || []) {
    console.log(indent + (child.type === 'dir' ? child.name + '/' : child.name));
    if (child.type === 'dir' && depth < maxDepth) print(child, indent + '  ', depth + 1, maxDepth);
  }
}

const url = process.argv[2] || 'https://github.com/expressjs/cors';
console.time('ingest');
const result = await ingestRepo(url);
console.timeEnd('ingest');
console.log(result.info);
console.log(result.stats);
print(result.tree);
