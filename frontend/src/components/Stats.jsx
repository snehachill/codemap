import { useEffect, useState } from 'react';
import { PALETTE } from '../lib/colors.js';

function CountUp({ value }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(target); return; }
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 650);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return <>{shown.toLocaleString()}</>;
}

export default function Stats({ stats }) {
  if (!stats) return null;
  const langs = Object.entries(stats.languages || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = langs.reduce((s, [, n]) => s + n, 0) || 1;
  let acc = 0;
  const gradient = langs.map(([, n], i) => { const from = (acc / total) * 100; acc += n; return `${PALETTE[i]} ${from}% ${(acc / total) * 100}%`; }).join(', ');

  return (
    <div className="stats">
      <div className="card stat"><span><i className="stat-icon">▤</i>Files</span><b><CountUp value={stats.fileCount} /></b></div>
      <div className="card stat"><span><i className="stat-icon">▦</i>Code chunks</span><b><CountUp value={stats.chunkCount} /></b></div>
      <div className="card stat"><span><i className="stat-icon">⌁</i>Import links</span><b><CountUp value={stats.edgeCount} /></b></div>
      <div className="card stat langs">
        <div className="donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="Language breakdown" />
        <ul>{langs.map(([l, n], i) => <li key={l}><i style={{ background: PALETTE[i] }} />{l} <em>{Math.round((n / total) * 100)}%</em></li>)}</ul>
      </div>
    </div>
  );
}
