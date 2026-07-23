# NBI Automation Tool

An internal web app that replaces an Excel-based workflow for managing "Actions" and "Insights" content per utility pilot, plus the "Interactions" (Action+Insight pairing) layer PE's config-generation script produces downstream.

- **Backend:** FastAPI + SQLAlchemy + SQLite (`backend/app/`)
- **Frontend:** React 19 + TypeScript + MUI v7, built with Vite (`frontend/src/`)

For a full technical/architectural walkthrough (RBAC model, content lifecycle, Interactions engine, deployment plan, session-by-session build history), see [`CLAUDE.md`](CLAUDE.md). For a walkthrough of what the tool does and how to use it day to day, see [`USER_GUIDE.md`](USER_GUIDE.md).

## Prerequisites

- Python 3.9+
- Node.js 18+ / npm
- Nothing else — the database is SQLite, no external services required

## Quick start

Two ways to run it locally:

### Option A — split dev servers (recommended while developing; hot-reload on both sides)

```bash
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && deactivate
cd ../frontend && npm install
cd ..
./run-dev.sh
```

This starts the backend on `http://localhost:8000` and the frontend on `http://localhost:5173`. Stop both with `Ctrl+C`.

### Option B — unified single-process build (matches the production deployment target)

```bash
./build.sh   # installs backend venv + builds frontend/dist
./run.sh     # serves both API and frontend on http://localhost:8010
```

Use this to sanity-check a change behaves the same way it will in production, where one FastAPI process serves both the API and the built frontend from a single origin (no CORS, no separate frontend URL to configure).

## First login

The database seeds a small set of accounts on first run (`python -m app.seed`, invoked automatically the first time `backend/nbi_tool.db` doesn't exist). See `backend/app/seed.py` for the exact accounts and passwords — **these are placeholder credentials for local development only.** Rotate or delete them via the in-app Users page (admin-only) before giving anyone outside your own machine access to a running instance.

## Configuration

Both apps read config from environment variables — copy the `.env.example` in each directory to `.env` and adjust:

**`backend/.env`**
| Variable | Purpose | Local default |
|---|---|---|
| `ALLOWED_ORIGINS` | Comma-separated frontend origins allowed to call the API (CORS) | `http://localhost:5173` |
| `SESSION_TTL_HOURS` | How long a login session stays valid | `168` (7 days) |
| `DATABASE_URL` | SQLite file path — point this at a persistent volume on any host with an ephemeral filesystem | `sqlite:///./nbi_tool.db` |

**`frontend/.env`**
| Variable | Purpose | Local default |
|---|---|---|
| `VITE_API_BASE_URL` | Where the frontend sends API calls. Leave **empty** (`""`) for the unified single-process deployment (same-origin relative paths) — `build.sh` already does this for you. Set to a full URL only if the frontend and backend are served from different origins. | `http://localhost:8000` |

## Roles at a glance

Three roles — `admin` (full access), `tpm_csm` (content editor), `utility` (external, scoped per-account, edit rights on a fixed set of content fields). Full detail in [`USER_GUIDE.md`](USER_GUIDE.md); the underlying permission rules live in exactly one place, `backend/app/rbac_matrix.py`.

## Project status / deployment

This is a working prototype, actively used for real pilot content, not yet deployed anywhere beyond localhost. The intended production shape (Option A: one FastAPI process serving the built frontend + API on one origin, on Railway with a persistent-volume SQLite file) is implemented and locally verified but **not yet deployed** — see `CLAUDE.md`'s "Deployment plan" and "Known open items" sections for exactly what's left (a `Dockerfile`, a `/health` route, and the one-time production seeding strategy).

## Security

A full security/correctness review was completed 2026-07-23 — see `CLAUDE.md`'s "Security + correctness fix pass" section for what was found and fixed (including a critical path-traversal issue in the static-file-serving route, now fixed). Before sharing a running instance with anyone:

- Rotate every seeded/placeholder account password via the Users page (no account should still be on its default password).
- Confirm `ALLOWED_ORIGINS` is set to the real frontend origin, not left at the localhost default, for any non-local deployment.
- Treat this repo's history as sensitive if it's ever made more broadly accessible — don't add real secrets to committed files; use `.env` (already gitignored) for anything sensitive.
