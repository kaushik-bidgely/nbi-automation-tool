# CLAUDE.md — NBI Automation Tool

Auto-loaded by Claude Code at the start of every session in this repo. This is a standalone web app (FastAPI + React) built for a Bidgely PM (Kaushik) to replace an Excel-based workflow for managing "Actions" and "Insights" content per utility pilot.

**Full product documentation (vision, technical reference, build history) lives outside this repo**, in the PM's Obsidian vault: `~/bidgely_pm_vault/Personal/PM Functional Review/Design/DETO/CMS - Insights/Old NBIs/` — start at `00 - README.md` there for product context. This file covers only what a coding session needs.

## Stack

- **Backend:** FastAPI + SQLAlchemy + SQLite (`backend/app/`). `nbi_tool.db` is the SQLite file — no Alembic/migrations; a schema change means `rm nbi_tool.db && python -m app.seed /path/to/sheet.xlsx` to reseed.
- **Frontend:** React 19 + TypeScript + MUI v7, built with Vite (`frontend/src/`).
- **Auth:** bearer-token sessions (7-day expiry, checked in `get_current_user`), PBKDF2-hashed passwords (see `backend/app/auth.py`). Login is rate-limited per username (in-memory, single-process only) and timing-safe against username enumeration.
- **Config via env vars** (see `backend/.env.example`, `frontend/.env.example`): backend `ALLOWED_ORIGINS` (CORS) and `SESSION_TTL_HOURS`; frontend `VITE_API_BASE_URL` (defaults to `http://localhost:8000` for local dev — must be set before building for any other deployment target).

## Running it

```bash
# Backend
cd backend && source venv/bin/activate && uvicorn app.main:app --port 8000 --reload

# Frontend
cd frontend && npm run dev -- --port 5173
```

Seeded test accounts: `admin`/`admin123`, `tpm1`/`tpm123`, `utility_demo`/`utility123` (scoped to Demo Pilot, Actions only, Paper channel). These are prototype-only credentials for local dev — rotate or delete them via the Users page before other teams get real access. The dev-only "Switch account" dropdown that used to bypass login for these has been removed from `App.tsx`.

## Core architecture — read before changing permissions or the content model

**Three roles:** `admin` (full access), `tpm_csm` (content-edit), `utility` (external, read-only, scoped per-account via `User.allowed_pilot_ids`/`content_scope`/`channel_scope`).

**Two content entities**, `ActionItem` and `InsightItem` (`backend/app/models.py`), each belonging to a `Pilot`. `(pilot_id, action_id)`/`(pilot_id, insight_id)` are unique together — the same natural-key code can exist in multiple pilots.

**Field-level permissions are defined in exactly one place: `backend/app/rbac_matrix.py`.** Every field has a `category` (`content`/`image`/`internal`/`generated`) and a per-role permission (`edit`/`view`/`none`). `backend/app/permissions.py`'s functions are thin resolvers over this file — don't hand-edit permission sets anywhere else. The frontend has no local copy of these rules; it fetches `GET /api/permissions/actions` / `/insights` and renders from that (see `AuthContext.tsx`'s `usePermissions` hook). If you add a new field to `ActionItem`/`InsightItem`, you must add a matching `FieldRule` to `rbac_matrix.py` or it won't appear in any API response for any role.

**Content lifecycle** (independent of role permissions above): `draft → ready_for_qa → published → modified → ready_for_qa`. Transitions live in `main.py` as dedicated endpoints (`/submit`, `/unlock`, `/publish`), not the generic `PATCH` — the generic update endpoint blocks all edits to a `published` item until `/unlock` is called.

**Merge is a separate concept from the lifecycle above.** An `InteractionRecord` pairs one Action with one Insight (Admin-only, via `POST /api/interactions`). Merging/un-merging never changes the linked item's status; whether something is merged is a computed `merged` property (checks for an `InteractionRecord`), not a stored flag.

**CSV export** (`backend/app/sheet_export.py`) reconstructs the *original* master-sheet column layout (73 cols Actions / 102 cols Insights) from the structured fields — including replicating a known source-file quirk (Insights' "Lighting" flag column uses token `li` even though the identity column stores `lt`). Don't "fix" that — it's intentional fidelity to the real spreadsheet. Two endpoints trigger it: `/publish` (Ready for QA → Published, admin-only, mutates status) and `/export` (read-only snapshot of everything at Ready for QA or later, admin-only, no status change — the "Download Sheet" button on the Actions/Insights list pages).

## Conventions established this session (follow these, don't relitigate them)

- Backend response filtering happens server-side for **every** role via `resolve_action_permissions`/`resolve_insight_permissions` + `filter_response` in `main.py` — never rely on the frontend to hide a field that a role shouldn't see at all.
- Frontend components (`FieldGroup.tsx`, `TagEditor.tsx`, list pages, editors) read editability from the permissions map (`permissions[field] === "edit"`), not from hardcoded role checks or TS constants. `frontend/src/fieldGroups.ts` holds only UI-layout metadata (channel groupings, char limits, tag vocab) — not permission data.
- Verification pattern used throughout: curl with real login tokens per role to check API-level enforcement, then browser click-through (via the preview/browser tools) per role to confirm UI behavior matches. Do both — API-only or UI-only checks have each missed real bugs in this project before.
- Before assuming a bug, check whether the backend has `--reload` running — a stale process has caused "my fix isn't working" confusion at least once.

## Known open items

- Script 1/Script 2 push-to-database logic hasn't been confirmed with Delivery/PE — the Publish action currently produces a CSV export, not a real push to `NBA_asset_data`.
- No real hosting decision made yet — deployment is on Kaushik to execute; see the hosting guide delivered 2026-07-15 for the concrete options.
- The seeded accounts' passwords (`admin123`/`tpm123`/`utility123`) are prototype defaults — rotate them via Manage Users (or create real per-person accounts and delete these) before other teams get access.
- Login rate-limiting is in-memory and per-process — fine for a single `uvicorn` process, won't hold up if this ever runs behind multiple workers/replicas.
