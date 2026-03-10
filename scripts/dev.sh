#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting Nightloop backend on http://localhost:4000 ..."
( cd backend && npm run dev ) &
BACKEND_PID=$!

echo "Starting Nightloop frontend on http://localhost:3000 ..."
( cd frontend && npm run dev ) &
FRONTEND_PID=$!

echo "Nightloop dev is running."
echo "- Frontend: http://localhost:3000"
echo "- Backend:  http://localhost:4000"
echo "Press Ctrl+C to stop both."

wait "$BACKEND_PID" "$FRONTEND_PID"
