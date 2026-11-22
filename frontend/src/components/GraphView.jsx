import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

const isTest = (p) => /(^|\/)(tests?|__tests__|spec|e2e|examples?|benchmarks?)\//i.test(p) || /\.(test|spec)\.[jt]sx?$/.test(p);

// Dependency graph: node = file, size = how many files import it, color = top-level folder.
export default function GraphView({ graph, colorOf, cited, onOpen }) {
  const wrap = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [t, setT] = useState(zoomIdentity);
  const [hover, setHover] = useState(null);
  const [hideTests, setHideTests] = useState(true);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // Layout is computed once (300 ticks), so the graph stays still and readable.
  const layout = useMemo(() => {
    const keep = (id) => !hideTests || !isTest(id);
    const edgesIn = graph.edges.filter((e) => keep(e.from) && keep(e.to));
    const linked = new Set();
    edgesIn.forEach((e) => { linked.add(e.from); linked.add(e.to); });
    const nodes = graph.nodes
      .filter((n) => linked.has(n.id))
      .sort((a, b) => b.importedBy + b.imports - (a.importedBy + a.imports))
      .slice(0, 150)
      .map((n) => ({ ...n, r: Math.min(26, 7 + Math.sqrt(n.importedBy) * 5) }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = edgesIn.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to }));
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((d) => d.id).distance(80).strength(0.6))
      .force('charge', forceManyBody().strength(-220))
      .force('x', forceX(0).strength(0.05))
      .force('y', forceY(0).strength(0.05))
      .force('collide', forceCollide((d) => d.r + 10))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    // Same file name in different folders (index.js, utils.js): show the folder too.
    const seen = {};
    nodes.forEach((n) => { const b = n.id.split('/').pop(); seen[b] = (seen[b] || 0) + 1; });
    nodes.forEach((n) => { const parts = n.id.split('/'); n.label = seen[parts.at(-1)] > 1 && parts.length > 1 ? parts.slice(-2).join('/') : parts.at(-1); });
    return { nodes, links };
  }, [graph, hideTests]);

  useEffect(() => {
    if (!svgRef.current || !layout.nodes.length) return;
    const z = zoom().scaleExtent([0.2, 5]).on('zoom', (e) => setT(e.transform));
    const sel = select(svgRef.current);
    sel.call(z);
    // Fit the whole graph into view at the start.
    const xs = layout.nodes.map((n) => n.x), ys = layout.nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 60, Math.max(...xs) + 60, Math.min(...ys) - 60, Math.max(...ys) + 60];
    const k = Math.min(1.3, size.w / (x1 - x0), size.h / (y1 - y0)) || 1;
    sel.call(z.transform, zoomIdentity.translate(size.w / 2 - ((x0 + x1) / 2) * k, size.h / 2 - ((y0 + y1) / 2) * k).scale(k));
    return () => sel.on('.zoom', null);
  }, [layout, Math.round(size.w / 40)]);

  const empty = !layout.nodes.length; // keep the wrapper mounted so refs and observers always have an element
  const near = (id) => hover && (hover.id === id || layout.links.some((l) => (l.source.id === hover.id && l.target.id === id) || (l.target.id === hover.id && l.source.id === id)));

  return (
    <div className="graph-wrap" ref={wrap}>
      {empty && <div className="empty">No import links found in this repo. The graph needs JS/TS files that import each other. Try the Treemap or Code tab.</div>}
      {!empty && <svg ref={svgRef} width="100%" height="100%" role="img" aria-label="Dependency graph of the repository">
        <g transform={t.toString()}>
          {layout.links.map((l, i) => {
            const on = hover && (l.source.id === hover.id || l.target.id === hover.id);
            return <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} stroke={on ? '#4F46E5' : '#CBD0E3'} strokeWidth={on ? 2.2 : 1.4} opacity={hover && !on ? 0.3 : 1} />;
          })}
          {layout.nodes.map((n) => {
            const isCited = cited.has(n.id);
            const dim = hover && !near(n.id);
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} className="gnode" opacity={dim ? 0.3 : 1}
                 onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} onClick={() => onOpen({ path: n.id })}>
                {isCited && <circle className="pulse" r={n.r + 9} fill="none" stroke="#4F46E5" strokeWidth="3" />}
                <circle r={n.r} fill={colorOf(n.id)} stroke="#fff" strokeWidth="2.5" />
                {(n.importedBy > 0 || isCited || hover?.id === n.id || layout.nodes.length <= 40) && <text y={n.r + 14} textAnchor="middle" className="glabel">{n.label}</text>}
              </g>
            );
          })}
        </g>
      </svg>}
      {hover && (
        <div className="tooltip"><b>{hover.id}</b><span>imported by {hover.importedBy} · imports {hover.imports}</span></div>
      )}
      <div className="legend">{colorOf.legend.slice(0, 6).map((l) => <span key={l.folder}><i style={{ background: l.color }} />{l.folder}</span>)}</div>
      <label className="toggle"><input type="checkbox" checked={hideTests} onChange={(e) => setHideTests(e.target.checked)} /> Hide tests &amp; examples</label>
      <div className="hint">Scroll to zoom · drag to pan · bigger node = more files depend on it</div>
    </div>
  );
}
