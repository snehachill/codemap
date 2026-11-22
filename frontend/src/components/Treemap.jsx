import { useEffect, useMemo, useRef, useState } from 'react';
import { hierarchy, treemap } from 'd3-hierarchy';

// Each rectangle is a file; area = file size. Shows at a glance where the code lives.
export default function Treemap({ tree, colorOf, onOpen }) {
  const wrap = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const root = useMemo(() => {
    const h = hierarchy(tree, (d) => d.children).sum((d) => (d.type === 'file' ? Math.max(d.size, 300) : 0)).sort((a, b) => b.value - a.value);
    treemap().size([size.w, size.h]).paddingInner(3).paddingOuter(4).paddingTop((d) => (d.depth === 1 ? 20 : 4)).round(true)(h);
    return h;
  }, [tree, size.w, size.h]);

  const files = root.leaves();
  const folders = root.children?.filter((c) => c.children) || [];

  return (
    <div className="treemap-wrap" ref={wrap}>
      <svg width={size.w} height={size.h} role="img" aria-label="Treemap of files by size">
        {folders.map((f) => (
          <g key={f.data.path}>
            <rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} rx="8" fill="#fff" stroke="#E4E7F0" />
            <text x={f.x0 + 8} y={f.y0 + 14} className="tm-folder">{f.data.name}/</text>
          </g>
        ))}
        {files.map((f) => {
          const w = f.x1 - f.x0, h = f.y1 - f.y0;
          return (
            <g key={f.data.path} className="tm-file" onClick={() => onOpen({ path: f.data.path })}>
              <rect x={f.x0} y={f.y0} width={w} height={h} rx="5" fill={colorOf(f.data.path)} opacity="0.88" />
              <title>{f.data.path}</title>
              {w > 64 && h > 22 && <text x={f.x0 + 6} y={f.y0 + 15} className="tm-label">{f.data.name.length * 6.5 > w - 10 ? f.data.name.slice(0, Math.floor((w - 10) / 6.5)) + '…' : f.data.name}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
