export const PALETTE = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6'];
export const folderOf = (p) => (p.includes('/') ? p.split('/')[0] : '(root)');

// Same top-level folder -> same color everywhere (tree, graph, treemap).
export function makeColorizer(paths) {
  const counts = {};
  paths.forEach((p) => { const f = folderOf(p); counts[f] = (counts[f] || 0) + 1; });
  const order = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const map = Object.fromEntries(order.map((f, i) => [f, PALETTE[i % PALETTE.length]]));
  const colorOf = (path) => map[folderOf(path)] || '#94A3B8';
  colorOf.legend = order.slice(0, 8).map((f) => ({ folder: f, color: map[f] }));
  return colorOf;
}

export const flattenFiles = (node, out = []) => {
  if (node.type === 'file') out.push(node);
  (node.children || []).forEach((c) => flattenFiles(c, out));
  return out;
};
