import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ask } from '../api.js';

const SUGGESTIONS = ['What does this project do?', 'Where is the entry point?', 'How does error handling work?'];
const CITE = /\[([^\[\]:\s]+):(\d+)(?:-(\d+))?\]/g;

// Turns [path:10-20] in the answer into clickable links (#cite:path:10-20).
const linkCitations = (text) =>
  text.replace(CITE, (_, path, a, b) => `[${path}:${a}${b ? '-' + b : ''}](#cite:${encodeURIComponent(path)}:${a}-${b || a})`);

export default function Chat({ repoKey, ready, onOpen, onCited }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const patchLast = (fn) => setMessages((m) => m.map((x, i) => (i === m.length - 1 ? fn(x) : x)));

  async function send(q = input) {
    q = q.trim();
    if (!q || busy || !ready) return;
    const history = messages.filter((m) => m.text && !m.error).map((m) => ({ role: m.role, content: m.text }));
    setInput(''); setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '', sources: [], valid: null }]);
    try {
      await ask(repoKey, q, history, {
        retrieved: (sources) => patchLast((x) => ({ ...x, sources })),
        token: ({ text }) => patchLast((x) => ({ ...x, text: x.text + text })),
        done: ({ refused, citations }) => {
          patchLast((x) => ({ ...x, refused, valid: Object.fromEntries(citations.map((c) => [`${c.path}:${c.startLine}-${c.endLine}`, c.valid])) }));
          onCited(new Set(citations.filter((c) => c.valid).map((c) => c.path)));
        },
        error: ({ message }) => patchLast((x) => ({ ...x, error: message }))
      });
    } catch (err) {
      patchLast((x) => ({ ...x, error: err.message }));
    }
    setBusy(false);
  }

  const renderLink = (m) => ({ href, children }) => {
    if (!href?.startsWith('#cite:')) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
    const [encPath, range] = href.slice(6).split(':');
    const path = decodeURIComponent(encPath);
    const [a, b] = range.split('-').map(Number);
    const verdict = m.valid?.[`${path}:${a}-${b}`];
    return (
      <button className={`cite ${verdict === true ? 'ok' : verdict === false ? 'bad' : ''}`} onClick={() => onOpen({ path, start: a, end: b })}
              title={verdict === false ? 'This citation was not in the retrieved code' : 'Open in code viewer'}>
        {verdict === true && '✓ '}{children}
      </button>
    );
  };

  return (
    <aside className="chat">
      <div className="panel-title">Ask about this repo</div>
      <div className="messages">
        {!messages.length && (
          <div className="chat-empty">
            <p>{ready ? 'Ask anything about the code. Answers cite exact files and lines.' : 'Indexing is still running. Chat unlocks when embedding finishes.'}</p>
            {SUGGESTIONS.map((s) => <button key={s} className="chip block" disabled={!ready} onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'user' ? m.text : (
              <>
                {m.error ? <p className="error">{m.error}</p> : <ReactMarkdown components={{ a: renderLink(m) }}>{linkCitations(m.text) || '…'}</ReactMarkdown>}
                {m.refused && <p className="note">No relevant code found, so nothing was guessed.</p>}
                {m.sources?.length > 0 && (
                  <details className="sources"><summary>{m.sources.length} code chunks used</summary>
                    {m.sources.map((s, j) => (
                      <button key={j} className="source" onClick={() => onOpen({ path: s.path, start: s.startLine, end: s.endLine })}>
                        {s.path}:{s.startLine}-{s.endLine}{s.symbol ? ` · ${s.symbol}` : ''}
                      </button>
                    ))}
                  </details>
                )}
              </>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input aria-label="Ask about this repository" placeholder={ready ? 'Ask about this repo…' : 'Waiting for indexing…'} value={input} onChange={(e) => setInput(e.target.value)} disabled={!ready || busy} />
        <button className="btn-primary" disabled={!ready || busy || !input.trim()}>{busy ? '…' : 'Ask'}</button>
      </form>
    </aside>
  );
}
