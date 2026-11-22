import { useState } from 'react';

function Node({ node, depth, colorOf, active, cited, onOpen }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.type === 'dir') {
    return (
      <li>
        <button className="tree-row" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className={`chev ${open ? 'open' : ''}`}>›</span><span className="tree-dir">{node.name}</span>
        </button>
        {open && <ul>{node.children.map((c) => <Node key={c.path} node={c} depth={depth + 1} colorOf={colorOf} active={active} cited={cited} onOpen={onOpen} />)}</ul>}
      </li>
    );
  }
  const cls = `tree-row file ${active === node.path ? 'active' : ''} ${cited.has(node.path) ? 'cited' : ''}`;
  return (
    <li>
      <button className={cls} style={{ paddingLeft: 24 + depth * 14 }} onClick={() => onOpen({ path: node.path })}>
        <i className="file-dot" style={{ background: colorOf(node.path) }} />{node.name}
      </button>
    </li>
  );
}

export default function FileTree({ tree, colorOf, active, cited, onOpen }) {
  return (
    <nav className="tree" aria-label="Repository files">
      <div className="panel-title">Files</div>
      <ul>{tree.children.map((c) => <Node key={c.path} node={c} depth={0} colorOf={colorOf} active={active} cited={cited} onOpen={onOpen} />)}</ul>
    </nav>
  );
}
