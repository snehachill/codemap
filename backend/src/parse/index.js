// Runs the parser over every file and produces: chunks + dependency graph.
import { getParser } from './parser.js';
import { chunkWithAst, chunkFixed } from './chunker.js';
import { extractImports, resolveImport, loadAliases, resolveAlias } from './imports.js';

export async function analyzeFiles(files) {
  const fileSet = new Set(files.map((f) => f.path));
  const aliases = loadAliases(files);
  const chunks = [];
  const edgeMap = new Map();
  const externals = {};
  const codeFiles = [];
  let count = 0;

  for (const file of files) {
    if (++count % 25 === 0) await new Promise((r) => setImmediate(r));
    const parser = await getParser(file.path);
    if (!parser) { chunks.push(...chunkFixed(file)); continue; } // json, md, css, ...

    let tree;
    try {
      tree = parser.parse(file.content);
      chunks.push(...chunkWithAst(tree, file));
      codeFiles.push(file.path);

      for (const spec of extractImports(tree)) {
        const to = spec.startsWith('.') ? resolveImport(file.path, spec, fileSet) : resolveAlias(spec, aliases, fileSet);
        if (to) {
          if (to !== file.path) edgeMap.set(`${file.path}->${to}`, { from: file.path, to });
        } else if (!spec.startsWith('.')) {
          const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
          externals[pkg] = (externals[pkg] || 0) + 1;
        }
      }
    } catch (err) {
      console.warn(`Could not parse ${file.path}: ${err.message}`);
      chunks.push(...chunkFixed(file)); // never lose a file because of a parse error
    } finally {
      tree?.delete(); // frees WASM memory
    }
  }

  const edges = [...edgeMap.values()];
  const importedBy = {}, imports = {};
  for (const e of edges) {
    importedBy[e.to] = (importedBy[e.to] || 0) + 1;
    imports[e.from] = (imports[e.from] || 0) + 1;
  }
  // importance = how many files depend on this one (used to size nodes in the graph)
  // Files that are only imported (a .css or .json file) still need a node, or their edge would be lost.
  const ids = new Set(codeFiles);
  edges.forEach((e) => { ids.add(e.from); ids.add(e.to); });
  const nodes = [...ids].map((id) => ({ id, importedBy: importedBy[id] || 0, imports: imports[id] || 0 }));

  return { chunks, graph: { nodes, edges }, externals };
}
