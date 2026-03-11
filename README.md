# Nightloop

Nightloop is an AI-native project scaffold for building a nightly data ingestion, scoring, and recommendation loop.

## Quick start (local)

### 1) Install deps

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2) Configure env files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 3) Start both apps together (single command)

```bash
npm run dev
```

This runs:
- backend on `http://localhost:4000`
- frontend on `http://localhost:3000`

### 4) Build checks

```bash
npm run build
```

## Useful endpoints

- `GET http://localhost:4000/health`
- `GET http://localhost:4000/api/recommendations`
