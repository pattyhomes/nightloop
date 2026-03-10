# Nightloop

Nightloop is an AI-native project scaffold for building a nightly data ingestion, scoring, and agent-driven decision loop.

## Initial layout

- `backend/` core services and workers
- `frontend/` operator UI
- `data/` local datasets, fixtures, and outputs
- `agents/` agent prompts, configs, and orchestration
- `ingestion/` data connectors + normalization pipelines
- `scoring/` scoring models and evaluation logic
- `api/` API contracts and handlers
- `docs/` architecture and implementation notes

## Local dev (single command)

Copy/paste these commands from the repo root:

```bash
cd /Users/chuckclaw/.openclaw/workspace/nightloop
npm install --prefix backend
npm install --prefix frontend
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
npm run dev
```

That starts backend + frontend together in one terminal.

- backend: `http://localhost:4000`
- frontend: `http://localhost:3000`

Stop both with `Ctrl+C`.

## Build checks

From repo root:

```bash
npm run build
```
