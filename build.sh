#!/usr/bin/env bash
# One-shot install for backend (venv + pip) and frontend (npm).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Backend: venv + pip install"
cd "$ROOT_DIR/backend"
if [ ! -d venv ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

echo "==> Frontend: npm install + build"
cd "$ROOT_DIR/frontend"
npm install
VITE_API_BASE_URL="" npm run build

echo "==> Build complete. Frontend bundled into frontend/dist, served by uvicorn (see run.sh)."
