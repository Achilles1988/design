A design step for your engineering workflow — install it into any repo. It's built for getting drafts out fast, tweaking them with confidence, and keeping them from drifting. It is not meant to be a full-blown professional design tool.

This engineering app was built with AI collaboration — drafts, tooling, and the assistant interaction surfaces were developed alongside AI partners.

## Core Features

- **Design drafts** — Your design output is a **real front-end page**. AI generates them well, the tooling is mature, there's no third-party lock-in, and it doubles as a shared language between people (note: the UI in your actual production code doesn't have to be front-end).
- **App management** — Add, remove, and organize apps, with configurable conventions, layouts, paths, and asset installation.
- **Canvas management** — Add, rename, and remove canvases within an app.
- **Asset management** — Style assets, layout assets, and AI-assisted selection (filter assets to match your intent).
- **AI assistant** — Create canvases from conversation and filter assets from the docked assistant panel.
- **Mock data** — Built-in fake data to fill your drafts.

## Getting started

```bash
cd apps/design
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). App and canvas management write APIs require the design-fs middleware, which only runs under `npm run dev` — see [`docs/dev/api/design-fs.md`](docs/dev/api/design-fs.md) for the HTTP contract.

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server + `/__design_fs` filesystem API |
| `npm test` | Unit / component tests |
| `npm run build` | Production bundle (no write API) |
| `npm run preview` | Serve the build read-only |

## Acknowledgements

This project builds on excellent open-source libraries:

- [Vercel AI SDK](https://sdk.vercel.ai) (`ai`) — streaming model calls and tool orchestration.
- [assistant-ui](https://www.assistant-ui.com) (`@assistant-ui/react`, `@assistant-ui/react-markdown`) — the docked assistant shell and Markdown rendering.
