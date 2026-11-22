import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { createStore } from './store/index.js';
import { startIndexing, repoKeyOf } from './jobs/indexer.js';
import { retrieve } from './rag/retrieve.js';
import { buildMessages, streamAnswer, verifyCitations, NOT_FOUND } from './rag/answer.js';

const store = await createStore();
const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const meta = ({ tree, graph, externals, ...rest }) => rest;               // repo info without the heavy parts
const chunkMeta = (c) => ({ path: c.path, startLine: c.startLine, endLine: c.endLine, kind: c.kind, symbol: c.symbol });

// Looks up :owner/:repo or sends the error response itself.
async function loadRepo(req, res, { needReady = false } = {}) {
  const repo = await store.getRepo(repoKeyOf(req.params.owner, req.params.repo));
  if (!repo) { res.status(404).json({ error: 'Repo not found. POST /api/repos first.' }); return null; }
  if (needReady && repo.status !== 'ready') { res.status(409).json({ error: `Repo is not ready yet (status: ${repo.status})` }); return null; }
  return repo;
}

app.get('/api/health', (req, res) =>
  res.json({ ok: true, store: store.kind, embeddings: config.embeddings.provider, llm: config.llm.provider }));

// Start indexing (runs in the background). Poll GET /api/repos/:owner/:repo for progress.
app.post('/api/repos', async (req, res) => {
  try {
    const { key } = await startIndexing(store, req.body?.url);
    res.status(202).json({ key, status: 'queued' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/repos', async (req, res) => res.json((await store.listRepos()).map(meta)));

app.get('/api/repos/:owner/:repo', async (req, res) => { const r = await loadRepo(req, res); if (r) res.json(meta(r)); });
app.get('/api/repos/:owner/:repo/tree', async (req, res) => { const r = await loadRepo(req, res); if (r?.tree) res.json(r.tree); else if (r) res.status(409).json({ error: 'Tree not ready yet' }); });
app.get('/api/repos/:owner/:repo/graph', async (req, res) => { const r = await loadRepo(req, res); if (r?.graph) res.json(r.graph); else if (r) res.status(409).json({ error: 'Graph not ready yet' }); });

app.get('/api/repos/:owner/:repo/file', async (req, res) => {
  const r = await loadRepo(req, res); if (!r) return;
  const path = String(req.query.path || '');
  const content = await store.getFile(r.key, path);
  if (content === null) return res.status(404).json({ error: 'File not found' });
  res.json({ path, content });
});

// Debug/demo endpoint: see what retrieval returns without calling the LLM.
app.get('/api/repos/:owner/:repo/search', async (req, res) => {
  const r = await loadRepo(req, res, { needReady: true }); if (!r) return;
  const { chunks } = await retrieve(store, r.key, String(req.query.q || ''), {
    strategy: req.query.strategy === 'fixed' ? 'fixed' : 'ast', mode: req.query.mode === 'vector' ? 'vector' : 'hybrid'
  });
  res.json(chunks.map((c) => ({ ...chunkMeta(c), score: c.rrf ?? c.vectorScore })));
});

// Ask a question. Streams Server-Sent Events: retrieved -> token... -> done (or error).
app.post('/api/repos/:owner/:repo/ask', async (req, res) => {
  const r = await loadRepo(req, res, { needReady: true }); if (!r) return;
  const question = String(req.body?.question || '').trim();
  if (!question || question.length > 1000) return res.status(400).json({ error: 'Question must be 1-1000 characters' });
  const history = Array.isArray(req.body?.history) ? req.body.history.filter((m) => m && typeof m.content === 'string') : [];

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const { chunks, topVectorScore, keywordHits } = await retrieve(store, r.key, question);
    send('retrieved', chunks.map(chunkMeta));

    // Not relevant enough? Say so instead of letting the model guess.
    if (!chunks.length || (topVectorScore < config.retrieval.minVectorScore && keywordHits === 0)) {
      send('token', { text: NOT_FOUND });
      send('done', { refused: true, citations: [] });
      return res.end();
    }

    let answer = '';
    for await (const text of streamAnswer(buildMessages(question, chunks, history))) {
      answer += text;
      send('token', { text });
    }
    send('done', { refused: false, citations: verifyCitations(answer, chunks) });
  } catch (err) {
    send('error', { message: err.message });
  }
  res.end();
});

app.listen(config.port, () =>
  console.log(`CodeMap backend on http://localhost:${config.port}  [store: ${store.kind}, embeddings: ${config.embeddings.provider}, llm: ${config.llm.provider}]`));
