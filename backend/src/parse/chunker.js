// Splits a file into chunks. Two strategies, so we can compare them in the evaluation:
//   chunkWithAst  - follows code structure (functions, classes)   <- our approach
//   chunkFixed    - cuts every N lines, ignoring structure         <- the naive baseline

const MAX_LINES = 120; // very long functions are cut into windows of this size

const SYMBOL_TYPES = {
  function_declaration: 'function', generator_function_declaration: 'function',
  class_declaration: 'class', abstract_class_declaration: 'class',
  interface_declaration: 'interface', type_alias_declaration: 'type', enum_declaration: 'enum'
};
const FUNCTION_VALUES = new Set(['arrow_function', 'function', 'function_expression', 'generator_function']);

// If this top-level node defines something with a name, return { symbol, kind }.
function describe(node) {
  let n = node;
  if (n.type === 'export_statement') {
    n = n.childForFieldName('declaration');
    if (!n) return null;
  }
  if (SYMBOL_TYPES[n.type]) {
    return { symbol: n.childForFieldName('name')?.text ?? 'default', kind: SYMBOL_TYPES[n.type] };
  }
  if (n.type === 'lexical_declaration' || n.type === 'variable_declaration') {
    for (const d of n.namedChildren) {
      if (d.type !== 'variable_declarator') continue;
      const value = d.childForFieldName('value');
      if (value && FUNCTION_VALUES.has(value.type)) {
        return { symbol: d.childForFieldName('name')?.text ?? 'anonymous', kind: 'function' };
      }
    }
  }
  // CommonJS style:  app.use = function use() {...}   or   exports.send = (a) => {...}
  if (n.type === 'expression_statement') {
    const a = n.namedChildren[0];
    const right = a?.type === 'assignment_expression' ? a.childForFieldName('right') : null;
    if (right && FUNCTION_VALUES.has(right.type)) {
      return { symbol: a.childForFieldName('left').text, kind: 'function' };
    }
  }
  return null;
}

// Adds a chunk (rows are 0-based from tree-sitter; we store 1-based line numbers).
function addChunk(out, lines, path, startRow, endRow, symbol, kind) {
  for (let s = startRow, part = 1; s <= endRow; s += MAX_LINES, part++) {
    const e = Math.min(s + MAX_LINES - 1, endRow);
    const text = lines.slice(s, e + 1).join('\n');
    if (!text.trim()) continue;
    const long = endRow - startRow + 1 > MAX_LINES;
    out.push({
      path, startLine: s + 1, endLine: e + 1, kind,
      symbol: long ? `${symbol} (part ${part})` : symbol,
      text
    });
  }
}

// Old-style code wraps a whole file in  (function () { ... }());  -> return the statements inside it.
function iifeBody(node) {
  if (node.type !== 'expression_statement') return null;
  let call = node.namedChildren[0];
  if (call?.type === 'parenthesized_expression') call = call.namedChildren[0];   // (function () {}())
  if (call?.type !== 'call_expression') return null;
  let fn = call.childForFieldName('function');
  if (fn?.type === 'parenthesized_expression') fn = fn.namedChildren[0];         // (function () {})()
  if (!fn || !FUNCTION_VALUES.has(fn.type)) return null;
  const body = fn.childForFieldName('body');
  return body?.type === 'statement_block' ? body.namedChildren : null;
}

const topLevelNodes = (root) => root.namedChildren.flatMap((n) => iifeBody(n) ?? [n]);

export function chunkWithAst(tree, file) {
  const lines = file.content.split('\n');
  const out = [];
  let run = []; // consecutive top-level nodes that aren't functions/classes (imports, config, ...)

  const flushRun = () => {
    if (!run.length) return;
    addChunk(out, lines, file.path, run[0].startPosition.row, run[run.length - 1].endPosition.row, '(top-level)', 'module');
    run = [];
  };

  for (const node of topLevelNodes(tree.rootNode)) {
    const d = describe(node);
    if (!d) { run.push(node); continue; }

    // A comment right above a function belongs to that function.
    let startRow = node.startPosition.row;
    while (run.length && run[run.length - 1].type === 'comment' && run[run.length - 1].endPosition.row >= startRow - 1) {
      startRow = run.pop().startPosition.row;
    }
    flushRun();
    addChunk(out, lines, file.path, startRow, node.endPosition.row, d.symbol, d.kind);
  }
  flushRun();
  return out;
}

export function chunkFixed(file, size = 60, overlap = 10) {
  const lines = file.content.split('\n');
  const out = [];
  for (let s = 0; s < lines.length; s += size - overlap) {
    const e = Math.min(s + size - 1, lines.length - 1);
    const text = lines.slice(s, e + 1).join('\n');
    if (text.trim()) out.push({ path: file.path, startLine: s + 1, endLine: e + 1, kind: 'fixed', symbol: null, text });
    if (e === lines.length - 1) break;
  }
  return out;
}
