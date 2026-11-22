# CodeMap AI – Frontend (React + Vite, light theme)

    npm install
    npm run dev          # http://localhost:5173

Start the backend first (`npm run dev` inside /backend, port 4000). Vite proxies /api to it, so no CORS setup is needed.

## Screens
- **Home** (#/): paste a GitHub URL, live indexing stepper, recent repos.
- **Workspace** (#/repo/owner/repo): stats header, file tree, three tabs (Dependency graph, Code, Treemap) and the chat.
  The workspace opens as soon as the tree and graph exist; chat unlocks when embedding finishes.
- Clicking a citation in an answer opens the file at those lines and makes the file pulse in the graph.

## Structure
    src/api.js              backend calls + streaming (SSE) reader
    src/App.jsx             tiny hash router
    src/components/         Home, Workspace, Stats, FileTree, CodeView, GraphView, Treemap, Chat, Logo
    src/lib/colors.js       same folder = same color everywhere
    src/index.css           all styling (design tokens at the top)

To change the look, edit the CSS variables in :root (index.css): --brand, --brand-2, --bg.
