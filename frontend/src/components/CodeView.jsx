import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import { getFile } from '../api.js';

Object.entries({ javascript, typescript, json, markdown, css, xml, python, yaml }).forEach(([n, l]) => hljs.registerLanguage(n, l));
const LANG = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown', css: 'css', html: 'xml', py: 'python', yml: 'yaml', yaml: 'yaml' };
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Splits highlighted HTML into lines, closing and re-opening <span>s so each line is valid on its own.
function splitLines(html) {
  const out = [];
  let stack = [], cur = '';
  for (const tok of html.match(/<span[^>]*>|<\/span>|\n|[^<\n]+/g) || []) {
    if (tok === '\n') { out.push(cur + '</span>'.repeat(stack.length)); cur = stack.join(''); }
    else { cur += tok; if (tok.startsWith('<span')) stack.push(tok); else if (tok === '</span>') stack.pop(); }
  }
  out.push(cur + '</span>'.repeat(stack.length));
  return out;
}

export default function CodeView({ repoKey, file }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState('');
  const firstHl = useRef(null);

  useEffect(() => {
    if (!file) return;
    setContent(null); setError('');
    getFile(repoKey, file.path).then((d) => setContent(d.content)).catch((e) => setError(e.message));
  }, [repoKey, file?.path]);

  const lines = useMemo(() => {
    if (content === null) return [];
    const lang = LANG[file.path.split('.').pop().toLowerCase()];
    return splitLines(lang ? hljs.highlight(content, { language: lang, ignoreIllegals: true }).value : escapeHtml(content));
  }, [content, file?.path]);

  useEffect(() => { firstHl.current?.scrollIntoView({ block: 'center' }); }, [lines, file?.start]);

  if (!file) return <div className="empty">Select a file from the tree, or click a citation in the chat.</div>;
  if (error) return <div className="empty error">{error}</div>;
  if (content === null) return <div className="empty">Loading…</div>;

  let marked = false;
  return (
    <div className="code">
      <div className="code-head"><b>{file.path}</b>{file.start && <span className="pill">lines {file.start}–{file.end}</span>}</div>
      <div className="code-body">
        {lines.map((html, i) => {
          const n = i + 1;
          const hl = file.start && n >= file.start && n <= file.end;
          const ref = hl && !marked ? ((marked = true), firstHl) : null;
          return (
            <div key={n} ref={ref} className={`line ${hl ? 'hl' : ''}`}>
              <span className="ln">{n}</span><code dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
