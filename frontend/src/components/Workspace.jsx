import { useEffect, useMemo, useState } from 'react';
import Logo from './Logo.jsx';
import Stats from './Stats.jsx';
import FileTree from './FileTree.jsx';
import CodeView from './CodeView.jsx';
import GraphView from './GraphView.jsx';
import Treemap from './Treemap.jsx';
import Chat from './Chat.jsx';
import { getGraph, getRepo, getTree } from '../api.js';
import { flattenFiles, makeColorizer } from '../lib/colors.js';

const TABS = [['graph', 'Dependency graph'], ['code', 'Code'], ['treemap', 'Treemap']];

export default function Workspace({ owner, repo, theme, onToggleTheme }) {
  const key = `${owner}/${repo}`.toLowerCase();
  const [meta, setMeta] = useState(null);
  const [tree, setTree] = useState(null);
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('graph');
  const [file, setFile] = useState(null);
  const [cited, setCited] = useState(new Set());

  // Poll status until the repo is ready (or failed).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const m = await getRepo(key);
        if (stop) return;
        setMeta(m);
        if (m.status === 'error') return setError(m.error || 'Indexing failed');
        if (m.status !== 'ready') setTimeout(tick, 1500);
      } catch (e) { if (!stop) setError(e.message); }
    };
    tick();
    return () => { stop = true; };
  }, [key]);

  // Tree and graph exist as soon as embedding starts.
  useEffect(() => {
    if (!meta || tree || !['embedding', 'ready'].includes(meta.status)) return;
    Promise.all([getTree(key), getGraph(key)]).then(([t, g]) => { setTree(t); setGraph(g); }).catch((e) => setError(e.message));
  }, [meta?.status]);

  const colorOf = useMemo(() => (tree ? makeColorizer(flattenFiles(tree).map((f) => f.path)) : null), [tree]);
  const open = (f) => { setFile(f); setTab('code'); };
  const ready = meta?.status === 'ready';
  const pct = meta?.progress?.total ? Math.round((meta.progress.done / meta.progress.total) * 100) : 0;

  return (
    <div className="workspace">
      <header className="ws-head">
        <a href="#/" className="back" aria-label="Back to home"><Logo size={26} /></a>
        <div className="ws-title"><b>{key}</b>{meta?.info?.description && <span>{meta.info.description}</span>}</div>
        <span className={`status ${meta?.status || ''}`}>{ready ? 'Ready' : meta?.status === 'embedding' ? `Embedding ${pct}%` : meta?.status || 'Loading'}</span>
        <button className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? '☾ Dark' : '☀ Light'}</button>
      </header>
      {meta?.status === 'embedding' && <div className="progress"><div style={{ width: `${pct}%` }} /></div>}

      {error ? <div className="empty error">{error} <a href="#/">Go back</a></div> : (
        <div className="ws-body">
          <div className="ws-top"><Stats stats={meta?.stats} /></div>
          {!tree ? <div className="empty">Loading repository…</div> : (
            <div className="ws-grid">
              <FileTree tree={tree} colorOf={colorOf} active={file?.path} cited={cited} onOpen={open} />
              <section className="center">
                <div className="tabs" role="tablist">
                  {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
                </div>
                <div className="tab-body">
                  {tab === 'graph' && <GraphView graph={graph} colorOf={colorOf} cited={cited} onOpen={open} />}
                  {tab === 'code' && <CodeView repoKey={key} file={file} />}
                  {tab === 'treemap' && <Treemap tree={tree} colorOf={colorOf} onOpen={open} />}
                </div>
              </section>
              <Chat repoKey={key} ready={ready} onOpen={open} onCited={setCited} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
