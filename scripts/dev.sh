#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  trap - INT TERM EXIT
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

(cd "$ROOT_DIR/backend" && npm run dev) &
BACKEND_PID=$!

(cd "$ROOT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

wait -n "$BACKEND_PID" "$FRONTEND_PID"
