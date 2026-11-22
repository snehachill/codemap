import { PALETTE } from '../lib/colors.js';

export default function Stats({ stats }) {
  if (!stats) return null;
  const langs = Object.entries(stats.languages || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = langs.reduce((s, [, n]) => s + n, 0) || 1;
  let acc = 0;
  const gradient = langs.map(([, n], i) => { const from = (acc / total) * 100; acc += n; return `${PALETTE[i]} ${from}% ${(acc / total) * 100}%`; }).join(', ');

  return (
    <div className="stats">
      <div className="card stat"><span>Files</span><b>{stats.fileCount}</b></div>
      <div className="card stat"><span>Code chunks</span><b>{stats.chunkCount}</b></div>
      <div className="card stat"><span>Import links</span><b>{stats.edgeCount}</b></div>
      <div className="card stat langs">
        <div className="donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="Language breakdown" />
        <ul>{langs.map(([l, n], i) => <li key={l}><i style={{ background: PALETTE[i] }} />{l} <em>{Math.round((n / total) * 100)}%</em></li>)}</ul>
      </div>
    </div>
  );
}
