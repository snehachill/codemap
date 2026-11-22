# CodeMap AI

Paste a public GitHub repository and ask questions about its code. Answers come only from the repository's own code and cite the exact files and lines, and the system checks every citation.

> B.Tech CSE (7th semester) mini project, AKS University, Satna.
> Author: Sneha Tiwari. Guide: Ravi Mishra, Assistant Professor.

<!-- Add a screenshot here: ![CodeMap AI](docs/screenshot.png) -->

## What it does

- **Views of the repository:** file tree, dependency graph (who imports whom), code viewer, treemap and statistics.
- **Question answering (RAG):** retrieves the most relevant code and asks a language model to answer only from it, with `[path:startLine-endLine]` citations.
- **Citation check:** each citation must match a code chunk that was actually given to the model.
- **"Could not find" reply:** if nothing relevant is retrieved, the model is not called.

## How it works

1. **Index once:** download the repository as one archive, split JavaScript and TypeScript into chunks with Tree-sitter (functions and classes), build the dependency graph from imports, create embeddings locally, store everything in MongoDB Atlas.
2. **Per question:** embed the question, run vector search (plus keyword search when the question names exact identifiers), merge with Reciprocal Rank Fusion, send the top 6 chunks to the model, then verify the citations.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 18, Vite 5, d3, highlight.js, react-markdown |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas (Vector Search and Atlas Search) |
| Code parsing | Tree-sitter (web-tree-sitter, WebAssembly) |
| Embeddings | all-MiniLM-L6-v2, run locally (Hugging Face Transformers), 384 dimensions |
| Language model | openai/gpt-oss-120b on Groq |

## Setup

**You need:** Node.js (LTS, tested on v22), a free MongoDB Atlas cluster, a Groq API key and, recommended, a GitHub personal access token (public-repository access only).

1. **Backend**
   ```bash
   cd backend
   npm install
   ```
   Create `backend/.env`:
   ```
   MONGODB_URI=<your Atlas connection string>
   GROQ_API_KEY=<your Groq key>
   GITHUB_TOKEN=<your GitHub token>
   EMBEDDINGS_PROVIDER=local
   TOP_K=6
   MIN_VECTOR_SCORE=0.2
   INDEX_TESTS=false
   ```
   Then start it:
   ```bash
   npm start
   ```
   On the first start, the Atlas search indexes are created automatically (about a minute to become ready), and the embedding model (about 25 MB) is downloaded on first use.

2. **Frontend** (new terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173, enter a public GitHub URL, and wait for the status to show **Ready**.

**Never commit `.env`.** It is listed in `.gitignore`.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| EMBEDDINGS_PROVIDER | local | Where embeddings are generated |
| TOP_K | 6 | Chunks sent to the model per question |
| MIN_VECTOR_SCORE | 0.2 | If the best vector score is below this and keyword search finds nothing, reply "not found" |
| INDEX_TESTS | false | Embed test files (they are stored either way) |

## Scripts (in `backend/`)

| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the server (`dev` restarts on file changes) |
| `npm run try` | Ingest a repository from the command line |
| `npm run test:parse` | Test parsing offline, with no network or database |
| `npm run eval` | Run the retrieval evaluation |

## Evaluation

Retrieval was tested on expressjs/express with 10 golden questions (top 5 results):

| Strategy | Hit@5 | Precision@5 | MRR |
|---|---|---|---|
| Fixed chunks + vector | 0.80 | 0.28 | 0.42 |
| AST chunks + vector | 1.00 | 0.60 | 0.88 |
| AST chunks + hybrid | 1.00 | 0.56 | 0.82 |

Structure-aware chunking clearly helped. Hybrid search showed no gain on this small test. Only retrieval was measured, not the quality of the final answers.

## Limitations

- Public repositories only, one at a time.
- Tree-sitter chunking and the dependency graph cover JavaScript and TypeScript only. Other files use fixed 60-line chunks.
- The index is not updated when new commits are pushed. Files over 200 KB and anything past 2000 files are skipped.
- Citation checking confirms a citation points to retrieved code. It cannot guarantee every statement is correct.
- Small evaluation: 10 questions on one repository.

## Project structure

```
backend/
  src/ingest   download and filter files
  src/parse    Tree-sitter chunking and import graph
  src/embed    local embeddings
  src/store    MongoDB Atlas storage and search
  src/rag      retrieval, prompt, citation check
  src/jobs     background indexing
  scripts/     try, test:parse, evaluate
  eval/        golden questions
frontend/
  src/components/   Home, Workspace, FileTree, GraphView, CodeView, Treemap, Chat, Stats
```
