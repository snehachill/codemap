// Loads tree-sitter (WASM build, no compiling needed) and one parser per language.
import { createRequire } from 'node:module';
import path from 'node:path';
import Parser from 'web-tree-sitter';

const require = createRequire(import.meta.url);
const WASM_DIR = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');

// file extension -> grammar name
const GRAMMARS = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'tsx'
};

let initPromise;
const parsers = new Map();

// Returns a ready parser for this file, or null if we don't support the language yet.
export async function getParser(filePath) {
  const dot = filePath.lastIndexOf('.');
  const grammar = dot === -1 ? null : GRAMMARS[filePath.slice(dot).toLowerCase()];
  if (!grammar) return null;

  initPromise ??= Parser.init();
  await initPromise;

  if (!parsers.has(grammar)) {
    const language = await Parser.Language.load(path.join(WASM_DIR, `tree-sitter-${grammar}.wasm`));
    const parser = new Parser();
    parser.setLanguage(language);
    parsers.set(grammar, parser);
  }
  return parsers.get(grammar);
}
