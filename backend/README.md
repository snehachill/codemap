# CodeMap AI – Backend

GitHub URL -> files -> AST chunks + import graph -> embeddings -> MongoDB -> hybrid search -> cited answers (streamed).

## Setup
    npm install
    cp .env.example .env        # then fill in the values below
    npm run dev                 # http://localhost:4000

| What | Needed for | How |
|---|---|---|
| GITHUB_TOKEN | avoiding the 60 requests/hour limit | github.com/settings/tokens (no scopes) |
| GROQ_API_KEY + GROQ_MODEL | answers | console.groq.com. Model names change, check console.groq.com/docs/models |
| MONGODB_URI | persistence + Atlas Vector Search | free M0 cluster at mongodb.com/atlas. Leave empty to use memory (data lost on restart) |

Embeddings default to `local` (free, downloads a ~25 MB model on first use). Switch to OpenAI with `EMBEDDINGS_PROVIDER=openai`.
Do not change the embedding provider after indexing; re-index instead (vector sizes differ).

With Atlas, the server creates two search indexes on first start (`chunk_vector`, `chunk_text`).
They take about a minute to become ready; search returns nothing until then.

## API
| Method | Path | Purpose |
|---|---|---|
| POST | /api/repos  `{ "url": "https://github.com/o/r" }` | start indexing (returns 202) |
| GET | /api/repos/:owner/:repo | status: queued, fetching, parsing, embedding, ready, error + progress + stats |
| GET | /api/repos/:owner/:repo/tree | file tree (available once embedding starts) |
| GET | /api/repos/:owner/:repo/graph | `{ nodes, edges }` dependency graph |
| GET | /api/repos/:owner/:repo/file?path=lib/x.js | file content for the code viewer |
| GET | /api/repos/:owner/:repo/search?q=...&mode=hybrid\|vector&strategy=ast\|fixed | retrieval only, for debugging |
| POST | /api/repos/:owner/:repo/ask  `{ question, history? }` | streamed answer (Server-Sent Events) |

`/ask` events: `retrieved` (chunks used) -> `token` (text pieces) -> `done` (`{ refused, citations:[{path,startLine,endLine,valid}] }`) or `error`.
Use `fetch` + a stream reader in React (EventSource cannot send POST).

## Evaluation (for your report)
    npm run eval -- expressjs/express eval/golden.express.json
Indexes the repo with both chunking strategies and compares Fixed+vector, AST+vector and AST+hybrid on Hit@5, Precision@5 and MRR.
Write your own golden questions (20-30, several repos) in the same JSON format. Results go to eval/results.json.

## Layout
    src/ingest   GitHub download, file filter, tree        src/rag    retrieval, prompt, citation check
    src/parse    tree-sitter chunking + import graph        src/store  memory + MongoDB Atlas
    src/embed    local / openai / hash                      src/jobs   indexing pipeline
    scripts      try-ingest, test-offline, evaluate

## Offline testing (no accounts, no downloads of models)
    EMBEDDINGS_PROVIDER=hash LLM_PROVIDER=mock MIN_VECTOR_SCORE=0 npm run dev
`hash` and `mock` are test doubles; do not use their results in your report.
