#!/usr/bin/env bash
# Starts both the backend (FastAPI) and frontend (Vite) dev servers for local use.
# Usage: ./run-dev.sh
# Stop both with Ctrl+C.

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f backend/venv/bin/activate ]; then
  echo "backend/venv not found — run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo "frontend/node_modules not found — run: cd frontend && npm install"
  exit 1
fi

cleanup() {
  echo ""
  echo "Stopping servers..."
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd backend
  source venv/bin/activate
  uvicorn app.main:app --port 8000 --reload
) &
BACKEND_PID=$!

(
  cd frontend
  npm run dev -- --port 5173
) &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""

wait
