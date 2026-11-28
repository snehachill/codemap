import express from 'express';
import cors from 'cors';
import nodePath from 'node:path';
import { parseRepoUrl } from './ingest/github.js';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createStore } from './store/index.js';
import { startIndexing, repoKeyOf } from './jobs/indexer.js';
import { retrieve } from './rag/retrieve.js';
import { buildMessages, streamAnswer, verifyCitations, NOT_FOUND } from './rag/answer.js';


process.on('unhandledRejection', (err) => console.error('Unhandled:', err?.message || err));

const store = await createStore();
const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`${req.method} ${req.path}:`, err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: err?.message || 'Server error' });
    else res.end();
  });

const meta = ({ tree, graph, externals, ...rest }) => rest;             
const chunkMeta = (c) => ({ path: c.path, startLine: c.startLine, endLine: c.endLine, kind: c.kind, symbol: c.symbol });

// Looks up :owner/:repo or sends the error response itself.
async function loadRepo(req, res, { needReady = false } = {}) {
  const repo = await store.getRepo(repoKeyOf(req.params.owner, req.params.repo));
  if (!repo) { res.status(404).json({ error: 'Repo not found. POST /api/repos first.' }); return null; }
  if (needReady && repo.status !== 'ready') { res.status(409).json({ error: `Repo is not ready yet (status: ${repo.status})` }); return null; }
  return repo;
}

function searchTextFor(question, history) {
  const prev = [...history].reverse().find((m) => m.role === 'user' && String(m.content).trim() !== question)?.content;
  const isShort = question.split(/\s+/).length < 8;
  return prev && isShort ? `${String(prev).slice(0, 300)} ${question}` : question;
}

// Questions like "where is the entry point?" are answered best from package.json and its main file,
// because plain similarity search tends to return docs and config files for them.
const ENTRY_Q = /entry[ -]?point|main file|starting point|where does (it|the app|this \w+) (start|begin)/i;

async function entryPointChunks(key) {
  const raw = await store.getFile(key, 'package.json');
  if (!raw) return [];
  let main = 'index.js';
  try {
    const pkg = JSON.parse(raw);
    if (typeof pkg.main === 'string' && pkg.main) main = pkg.main;
  } catch { return []; }
  main = main.replace(/^\.\//, '');

  const top = (path, text, n) => {
    const lines = text.split('\n').slice(0, n);
    return { path, startLine: 1, endLine: lines.length, kind: 'file', symbol: null, text: lines.join('\n').slice(0, 6000) };
  };
  const out = [top('package.json', raw, 60)];
  const mainText = await store.getFile(key, main);
  if (mainText) out.push(top(main, mainText, 80));
  return out;
}

app.get('/api/health', (req, res) =>
  res.json({ ok: true, store: store.kind, embeddings: config.embeddings.provider, llm: config.llm.provider }));

// Start indexing (runs in the background). Poll GET /api/repos/:owner/:repo for progress.
app.post('/api/repos', async (req, res) => {
  try {
    // Hosted demo (READ_ONLY=true): only open repositories that were already indexed on the laptop.
    if (process.env.READ_ONLY === 'true') {
      const { owner, repo } = parseRepoUrl(req.body?.url);
      const key = repoKeyOf(owner, repo);
      const existing = await store.getRepo(key);
      if (existing?.status === 'ready') return res.status(200).json({ key, status: 'ready' });
      return res.status(403).json({ error: 'Demo mode: only repositories that were indexed in advance can be opened.' });
    }
    const { key } = await startIndexing(store, req.body?.url);
    res.status(202).json({ key, status: 'queued' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/repos', wrap(async (req, res) => res.json((await store.listRepos()).map(meta))));

app.get('/api/repos/:owner/:repo', wrap(async (req, res) => { const r = await loadRepo(req, res); if (r) res.json(meta(r)); }));
app.get('/api/repos/:owner/:repo/tree', wrap(async (req, res) => { const r = await loadRepo(req, res); if (r?.tree) res.json(r.tree); else if (r) res.status(409).json({ error: 'Tree not ready yet' }); }));
app.get('/api/repos/:owner/:repo/graph', wrap(async (req, res) => { const r = await loadRepo(req, res); if (r?.graph) res.json(r.graph); else if (r) res.status(409).json({ error: 'Graph not ready yet' }); }));

app.get('/api/repos/:owner/:repo/file', wrap(async (req, res) => {
  const r = await loadRepo(req, res); if (!r) return;
  const path = String(req.query.path || '');
  const content = await store.getFile(r.key, path);
  if (content === null) return res.status(404).json({ error: 'File not found' });
  res.json({ path, content });
}));

// Debug/demo endpoint: see what retrieval returns without calling the LLM.
app.get('/api/repos/:owner/:repo/search', wrap(async (req, res) => {
  const r = await loadRepo(req, res, { needReady: true }); if (!r) return;
  const { chunks } = await retrieve(store, r.key, String(req.query.q || ''), {
    strategy: req.query.strategy === 'fixed' ? 'fixed' : 'ast', mode: req.query.mode === 'vector' ? 'vector' : 'hybrid'
  });
  res.json(chunks.map((c) => ({ ...chunkMeta(c), score: c.rrf ?? c.vectorScore })));
}));

// Ask a question. Streams Server-Sent Events: retrieved -> token... -> done (or error).
app.post('/api/repos/:owner/:repo/ask', wrap(async (req, res) => {
  const r = await loadRepo(req, res, { needReady: true }); if (!r) return;
  const question = String(req.body?.question || '').trim();
  if (!question || question.length > 1000) return res.status(400).json({ error: 'Question must be 1-1000 characters' });
  const history = Array.isArray(req.body?.history) ? req.body.history.filter((m) => m && typeof m.content === 'string') : [];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'          // stops hosting proxies from holding the stream back
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const found = await retrieve(store, r.key, searchTextFor(question, history));
    const extra = ENTRY_Q.test(question) ? await entryPointChunks(r.key) : [];
    const chunks = [...extra, ...found.chunks.filter((c) => !extra.some((e) => e.path === c.path))];
    send('retrieved', chunks.map(chunkMeta));

    // Not relevant enough? Say so instead of letting the model guess.
    if (!extra.length && (!chunks.length || (found.topVectorScore < config.retrieval.minVectorScore && found.keywordHits === 0))) {
      send('token', { text: NOT_FOUND });
      send('done', { refused: true, citations: [] });
      return res.end();
    }

    let answer = '';
    for await (const text of streamAnswer(buildMessages(question, chunks, history, r.key))) {
      answer += text;
      send('token', { text });
    }
    send('done', { refused: false, citations: verifyCitations(answer, chunks) });
  } catch (err) {
    send('error', { message: err.message });
  }
  res.end();
}));

// Serve the built website (frontend/dist). Must come AFTER the /api routes.
const dist = nodePath.join(nodePath.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
app.use(express.static(dist));

// Hosts such as Render give the port in the PORT variable.
const port = process.env.PORT || config.port;
app.listen(port, () =>
  console.log(`CodeMap backend on http://localhost:${port}  [store: ${store.kind}, embeddings: ${config.embeddings.provider}, llm: ${config.llm.provider}]`));
