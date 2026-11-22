// The ingestion pipeline: URL -> repo info -> files -> tree + stats.
import { parseRepoUrl, getRepoInfo, downloadFiles } from './github.js';
import { buildTree } from './tree.js';
import { languageOf } from './filter.js';
import { analyzeFiles } from '../parse/index.js';

export async function ingestRepo(url) {
  const ref = parseRepoUrl(url);
  const info = await getRepoInfo(ref);
  const { files, skipped } = await downloadFiles(info);

  const { chunks, graph, externals } = await analyzeFiles(files);

  const languages = {};
  for (const f of files) {
    const lang = languageOf(f.path);
    languages[lang] = (languages[lang] || 0) + 1;
  }

  return {
    info,
    files,
    tree: buildTree(files),
    chunks,                      // next step: embed these
    graph,                       // { nodes, edges } for the dependency graph
    externals,                   // npm packages used and how often
    stats: { fileCount: files.length, chunkCount: chunks.length, edgeCount: graph.edges.length, languages, skipped }
  };
}
