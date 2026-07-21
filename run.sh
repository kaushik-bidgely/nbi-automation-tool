#!/usr/bin/env bash
# Single-process run: uvicorn serves the API and the built frontend
# (frontend/dist) together on one port. Run build.sh first.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8010

if [ ! -d "$ROOT_DIR/frontend/dist" ]; then
  echo "frontend/dist missing — run ./build.sh first." >&2
  exit 1
fi

cd "$ROOT_DIR/backend"
source venv/bin/activate
echo "==> Serving app on http://localhost:$PORT"
exec uvicorn app.main:app --port "$PORT"
