// Finds what each file imports, and turns "./auth" or "@/components/Navbar" into a real file path in the repo.
import path from 'node:path';

const EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json'];

const unquote = (s) => s.slice(1, -1);

// Returns the raw import strings in one file, e.g. ['./auth', 'express', '@/components/Navbar'].
export function extractImports(tree) {
  const found = [];
  const nodes = tree.rootNode.descendantsOfType(['import_statement', 'export_statement', 'call_expression']);

  for (const node of nodes) {
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      const isRequire = fn?.type === 'identifier' && fn.text === 'require';
      const isDynamic = fn?.type === 'import';
      if (!isRequire && !isDynamic) continue;
      const arg = node.childForFieldName('arguments')?.namedChildren[0];
      if (arg?.type === 'string') found.push(unquote(arg.text));
    } else {
      // import x from '...'   /   export * from '...'
      const source = node.childForFieldName('source');
      if (source?.type === 'string') found.push(unquote(source.text));
    }
  }
  return found;
}

// Tries a path as-is, with extensions, and as a folder with an index file.
function resolveBase(base, fileSet) {
  const candidates = [base];
  for (const ext of EXTENSIONS) candidates.push(base + ext);
  for (const ext of EXTENSIONS) candidates.push(`${base}/index${ext}`);
  // TypeScript projects often write './x.js' for a file that is really x.ts
  if (/\.jsx?$/.test(base)) candidates.push(base.replace(/\.jsx?$/, '.ts'), base.replace(/\.jsx?$/, '.tsx'));
  return candidates.find((c) => fileSet.has(c)) ?? null;
}

// './auth' imported from 'src/routes/users.js' -> 'src/routes/auth.js' (if that file exists).
export function resolveImport(fromPath, specifier, fileSet) {
  return resolveBase(path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier)), fileSet);
}

// ---- Path aliases: "@/components/Navbar" ----

// Reads tsconfig.json / jsconfig.json ("paths" and "baseUrl"). Falls back to the common "@/ = src/" convention.
export function loadAliases(files) {
  const aliases = [];
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const f = files.find((x) => x.path === name);
    if (!f) continue;
    let cfg;
    try {
      // tsconfig allows comments and trailing commas, which plain JSON.parse rejects
      cfg = JSON.parse(f.content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
    } catch { continue; }
    const opts = cfg.compilerOptions || {};
    const baseUrl = path.posix.normalize(opts.baseUrl || '.');
    for (const [pattern, targets] of Object.entries(opts.paths || {})) {
      const wildcard = pattern.endsWith('*');
      for (const t of targets) {
        const target = path.posix.normalize(path.posix.join(baseUrl, t));
        aliases.push({ prefix: pattern.replace(/\*$/, ''), target: wildcard ? target.replace(/\*$/, '') : target, wildcard });
      }
    }
    if (opts.baseUrl) aliases.push({ prefix: '', target: baseUrl === '.' ? '' : `${baseUrl}/`, wildcard: true });
  }
  if (!aliases.length) {
    aliases.push({ prefix: '@/', target: 'src/', wildcard: true }, { prefix: '@/', target: '', wildcard: true }, { prefix: '~/', target: 'src/', wildcard: true });
  }
  return aliases;
}

// '@/components/Navbar' -> 'src/components/Navbar.jsx' (if an alias matches and the file exists).
export function resolveAlias(specifier, aliases, fileSet) {
  for (const a of aliases) {
    const match = a.wildcard ? specifier.startsWith(a.prefix) : specifier === a.prefix;
    if (!match) continue;
    const base = path.posix.normalize(a.wildcard ? a.target + specifier.slice(a.prefix.length) : a.target);
    const hit = resolveBase(base, fileSet);
    if (hit) return hit;
  }
  return null;
}
