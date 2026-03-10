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

## Local setup (frontend + backend)

### 1) Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2) Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Default values are already wired for local dev:
- backend runs at `http://localhost:4000`
- frontend calls backend using `NEXT_PUBLIC_BACKEND_BASE_URL`

### 3) Run backend and frontend together (exact commands)

Terminal 1 (backend):

```bash
cd backend
npm run dev
```

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

Backend routes in local dev:
- health: `GET http://localhost:4000/health`
- recommendations: `GET http://localhost:4000/api/recommendations`

### 4) Production-style backend run (build + start)

```bash
cd backend
npm run build
npm run start
```

### 5) Build checks

```bash
cd backend && npm run build
cd ../frontend && npm run build
```
