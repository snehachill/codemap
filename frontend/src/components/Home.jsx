import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import { getRepo, listRepos, parseGithubUrl, startIndexing } from '../api.js';

const STEPS = ['Fetching files', 'Parsing code', 'Embedding chunks', 'Ready'];
const STEP_OF = { queued: 0, fetching: 0, parsing: 1, embedding: 2, ready: 3 };
const EXAMPLES = [{ label: 'Try Express', url: 'https://github.com/expressjs/express' }, { label: 'Try clsx', url: 'https://github.com/lukeed/clsx' }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FEATURES = [
  { title: 'See the structure', text: 'An interactive dependency graph and treemap show how files connect, so you know where to start.', color: '#4F46E5' },
  { title: 'Ask in plain English', text: 'Questions like "where is auth handled?" are answered from the real code, not from guesswork.', color: '#0EA5E9' },
  { title: 'Every answer cited', text: 'Each claim links to a file and line range, and we check that the citation really exists.', color: '#10B981' }
];

function HeroArt() {
  const nodes = [[200, 60, 22, '#4F46E5'], [90, 150, 16, '#0EA5E9'], [310, 140, 18, '#10B981'], [150, 260, 14, '#F59E0B'], [280, 270, 20, '#EC4899'], [370, 40, 11, '#8B5CF6'], [40, 60, 10, '#14B8A6']];
  const edges = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [0, 5], [1, 6], [2, 5]];
  return (
    <svg viewBox="0 0 420 320" className="hero-art" aria-hidden="true">
      {edges.map(([a, b], i) => <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="#C7CCE0" strokeWidth="2" />)}
      {nodes.map(([x, y, r, c], i) => (
        <g key={i} className="float" style={{ animationDelay: `${i * 0.4}s` }}>
          <circle cx={x} cy={y} r={r + 8} fill={c} opacity="0.12" />
          <circle cx={x} cy={y} r={r} fill={c} stroke="#fff" strokeWidth="3" />
        </g>
      ))}
    </svg>
  );
}

export default function Home({ theme, onToggleTheme }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);

  useEffect(() => { listRepos().then((r) => setRecent(r.filter((x) => x.status === 'ready'))).catch(() => {}); }, []);

  async function analyze(value = url) {
    setError('');
    const key = parseGithubUrl(value);
    if (!key) return setError('Please enter a URL like https://github.com/owner/repo');
    setBusy(true); setStep(0);
    try {
      await startIndexing(value);
      for (;;) {
        const repo = await getRepo(key);
        setStep(STEP_OF[repo.status] ?? 0);
        if (repo.status === 'error') throw new Error(repo.error || 'Indexing failed');
        if (repo.status === 'embedding' || repo.status === 'ready') break; // tree + graph are ready: open the workspace
        await sleep(1200);
      }
      location.hash = `#/repo/${key}`;
    } catch (err) {
      setError(err.message); setBusy(false); setStep(-1);
    }
  }

  return (
    <div className="home">


      <header className="home-nav"><Logo /><button className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? '☾ Dark' : '☀ Light'}</button></header>
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Codebase onboarding assistant</span>
          <h1>Understand any codebase in minutes</h1>
          <p className="lead">Map the structure, follow the connections, and get answers grounded in real code.</p>

          <form className="url-box" onSubmit={(e) => { e.preventDefault(); analyze(); }}>
            <input aria-label="GitHub repository URL" placeholder="https://github.com/owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
            {url && <button type="button" className="clear-url" aria-label="Clear URL" disabled={busy} onClick={() => { setUrl(''); setError(''); }}>×</button>}
            <button className="btn-primary" disabled={busy || !url.trim()}>{busy ? 'Working…' : 'Analyze'}</button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}

          {!busy && (
            <div className="try"><span>Start with an example</span>{EXAMPLES.map(({ label, url: exampleUrl }) => (
              <button key={label} type="button" className="chip" onClick={() => { setUrl(exampleUrl); setError(''); }}>{label}</button>
            ))}</div>
          )}

          {busy && (
            <ol className="stepper" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}><span className="dot">{i < step ? '✓' : i + 1}</span>{s}</li>
              ))}
            </ol>
          )}
        </div>
        <HeroArt />
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <article key={f.title} className="card feature">
            <span className="feature-bar" style={{ background: f.color }} />
            <h3>{f.title}</h3><p>{f.text}</p>
          </article>
        ))}
      </section>

      {recent.length > 0 && (
        <section className="recent">
          <h2>Recently analyzed</h2>
          <div className="recent-grid">
            {recent.map((r) => (
              <a key={r.key} className="card recent-card" href={`#/repo/${r.key}`}>
                <strong>{r.key}</strong>
                <span>{r.stats?.fileCount ?? '–'} files · {r.stats?.chunkCount ?? '–'} chunks</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <footer className="home-foot">Built with React, Node.js, MongoDB, tree-sitter and RAG</footer>
    </div>
  );
}
