// Turns a flat list of file paths into a nested tree the frontend can render.

export function buildTree(files) {
  const root = { name: '', path: '', type: 'dir', children: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    parts.forEach((name, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = isFile
          ? { name, path, type: 'file', size: file.size }
          : { name, path, type: 'dir', children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }

  sortTree(root);
  return root;
}

// Folders first, then files, each alphabetical.
function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
  node.children.forEach(sortTree);
}
