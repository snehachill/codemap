// Decides which files from a repo are worth indexing.

export const LIMITS = {
  maxFiles: 2000,          // stop collecting after this many files
  maxFileBytes: 200 * 1024 // skip files bigger than 200 KB
};

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', 'vendor',
  '.next', '.cache', '__pycache__', '.idea', '.vscode'
]);

const IGNORED_FILES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.min\.(js|css)$|\.map$/;

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.py', '.json', '.md', '.html', '.css', '.yml', '.yaml'
]);

// Returns 'keep' or the reason the file is skipped: 'ignored' | 'notCode' | 'tooBig'
export function classify(path, size) {
  const parts = path.split('/');
  if (parts.slice(0, -1).some((dir) => IGNORED_DIRS.has(dir))) return 'ignored';
  if (IGNORED_FILES.test(path)) return 'ignored';

  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) return 'notCode';

  if (size > LIMITS.maxFileBytes) return 'tooBig';
  return 'keep';
}

export function languageOf(path) {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  const map = {
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.py': 'Python', '.json': 'JSON',
    '.md': 'Markdown', '.html': 'HTML', '.css': 'CSS', '.yml': 'YAML', '.yaml': 'YAML'
  };
  return map[ext] || 'Other';
}

// Test files are useful to read but they drown out real answers in search, so we don't embed them by default.
export const isTestPath = (path) => /(^|\/)(tests?|__tests__|spec|e2e)\//i.test(path) || /\.(test|spec)\.[jt]sx?$/.test(path);
