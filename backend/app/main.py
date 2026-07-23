from __future__ import annotations

import csv
import io
import os
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import models, schemas, validation, permissions, interaction_logic
from .auth import hash_password, verify_password, generate_token
from .database import Base, engine, get_db
from .permissions import (
    action_editable_fields, insight_editable_fields,
    resolve_action_permissions, resolve_insight_permissions, filter_response,
)
from .rbac_matrix import ACTION_ALWAYS_INCLUDED, INSIGHT_ALWAYS_INCLUDED
from .schema_reference import get_action_schema, get_insight_schema, get_interaction_schema
from .seed import clone_pilot_content
from .sheet_export import export_actions_csv, export_insights_csv, sanitize_csv_cell
from .sheet_import import import_actions, import_insights, SheetFormatError
from .interaction_import import import_interactions
from .tag_logic import build_tag_string, build_insight_tag_string

Base.metadata.create_all(bind=engine)

app = FastAPI(title="NBI Automation Tool (prototype)")

# Comma-separated list of allowed frontend origins, e.g.
# "http://localhost:5173,https://nbi-tool.example.com" — defaults to the local
# Vite dev server so `npm run dev` keeps working out of the box. Wildcard "*"
# is deliberately not the default once this leaves localhost: this API's
# bearer token is attached by the frontend's own fetch calls, not sent
# automatically by the browser like a cookie would be, so wildcard CORS here
# wouldn't enable classic CSRF — but it would let ANY origin read responses
# from a token it obtained some other way (e.g. XSS), so it's still worth
# scoping down for a real deployment.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sessions are bearer tokens with no expiry column — rather than a schema
# change (this project reseeds instead of migrating, see CLAUDE.md), expiry is
# just a TTL off Session.created_at, checked on every request.
SESSION_TTL = timedelta(hours=int(os.environ.get("SESSION_TTL_HOURS", "168")))  # default 7 days

# Constant-cost placeholder hash so login() takes the same time whether or not
# the username exists — otherwise an unknown username short-circuits before
# the (deliberately slow, 260k-iteration) password hash runs, and the timing
# difference leaks which usernames are real.
_DUMMY_PASSWORD_HASH = hash_password("no-such-user")

# Minimal in-memory login throttle — per-process only (won't persist across
# restarts or coordinate across multiple workers), which is fine for this
# tool's single-process deployment but worth revisiting if that changes.
_LOGIN_ATTEMPT_WINDOW = timedelta(minutes=15)
_LOGIN_ATTEMPT_LIMIT = 10
_login_attempts: dict[str, list[datetime]] = defaultdict(list)


def _check_login_rate_limit(username: str):
    now = datetime.utcnow()
    recent = [t for t in _login_attempts[username] if now - t < _LOGIN_ATTEMPT_WINDOW]
    _login_attempts[username] = recent
    if len(recent) >= _LOGIN_ATTEMPT_LIMIT:
        raise HTTPException(429, "Too many failed login attempts for this account — try again later")


def _record_failed_login(username: str):
    _login_attempts[username].append(datetime.utcnow())


def get_current_user(authorization: str = Header(default=None), db: Session = Depends(get_db)) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    session = db.get(models.Session, token)
    if not session:
        raise HTTPException(401, "Invalid or expired session")
    if datetime.utcnow() - session.created_at > SESSION_TTL:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Session expired — please log in again")
    user = db.get(models.User, session.user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_role(user: models.User, *roles: str):
    if user.role not in roles:
        raise HTTPException(403, f"This action requires role in {roles}, you are '{user.role}'")


def require_not_utility(user: models.User):
    if user.role == "utility":
        raise HTTPException(403, "Utility accounts are read-only")


def check_pilot_access(user: models.User, pilot_id: int, content_type: str):
    """Enforces per-account scoping for Utility users: which pilots, and
    whether Actions/Insights/both are visible at all for this account."""
    if user.role != "utility":
        return
    if pilot_id not in (user.allowed_pilot_ids or []):
        raise HTTPException(403, "This account doesn't have access to this pilot")
    if user.content_scope != "both" and user.content_scope != content_type:
        raise HTTPException(403, f"This account doesn't have access to {content_type}")


def log_change(db: Session, entity_type: str, entity_id: int, field: str, old, new, role: str):
    if str(old) == str(new):
        return
    db.add(models.AuditLog(
        entity_type=entity_type, entity_id=entity_id, field=field,
        old_value=str(old) if old is not None else None,
        new_value=str(new) if new is not None else None,
        changed_by_role=role,
    ))


# ---------- Auth ----------

@app.post("/api/auth/login", response_model=schemas.LoginOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    _check_login_rate_limit(body.username)
    user = db.query(models.User).filter_by(username=body.username).first()
    password_hash = user.password_hash if user else _DUMMY_PASSWORD_HASH
    password_ok = verify_password(body.password, password_hash)
    if not user or not password_ok:
        _record_failed_login(body.username)
        raise HTTPException(401, "Invalid username or password")
    _login_attempts.pop(body.username, None)
    token = generate_token()
    db.add(models.Session(token=token, user_id=user.id))
    db.commit()
    return {"token": token, "user": user}


@app.post("/api/auth/logout")
def logout(authorization: str = Header(default=None), db: Session = Depends(get_db)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        session = db.get(models.Session, token)
        if session:
            db.delete(session)
            db.commit()
    return {"ok": True}


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


# ---------- Field permissions (drives frontend rendering — see rbac_matrix.py) ----------

@app.get("/api/permissions/actions")
def get_action_permissions(user: models.User = Depends(get_current_user)):
    """{field: "edit"|"view"|"none"} for the current user's role (+ channel_scope
    if Utility). The frontend uses this instead of hardcoding its own copy of
    the permission rules, so there's exactly one source of truth."""
    return resolve_action_permissions(user.role, user.channel_scope if user.role == "utility" else None)


@app.get("/api/permissions/insights")
def get_insight_permissions(user: models.User = Depends(get_current_user)):
    return resolve_insight_permissions(user.role, user.channel_scope if user.role == "utility" else None)


@app.get("/api/schema")
def get_schema_reference(user: models.User = Depends(get_current_user)):
    """Read-only field/vocabulary reference for the admin Schema page — see
    schema_reference.py. Not a permissions endpoint (that's the pair above);
    this is category/channel/type/accepted-values/description per field."""
    require_role(user, "admin")
    return {"actions": get_action_schema(), "insights": get_insight_schema(), "interactions": get_interaction_schema()}


# ---------- User management (Admin-only) ----------

@app.get("/api/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    return db.query(models.User).all()


@app.post("/api/users", response_model=schemas.UserOut)
def create_user(body: schemas.UserCreateIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    if body.role not in ("admin", "tpm_csm", "utility"):
        raise HTTPException(400, "role must be admin, tpm_csm, or utility")
    if db.query(models.User).filter_by(username=body.username).first():
        raise HTTPException(409, f"Username '{body.username}' already exists")
    new_user = models.User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        allowed_pilot_ids=body.allowed_pilot_ids if body.role == "utility" else [],
        content_scope=body.content_scope,
        channel_scope=body.channel_scope,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.patch("/api/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, body: schemas.UserUpdateIn, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    target = db.get(models.User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if body.role is not None:
        if body.role not in ("admin", "tpm_csm", "utility"):
            raise HTTPException(400, "role must be admin, tpm_csm, or utility")
        target.role = body.role
        if body.role != "utility":
            target.allowed_pilot_ids = []  # scoping only means something for utility accounts
    if body.password is not None:
        target.password_hash = hash_password(body.password)
        # An old bearer token would otherwise keep authenticating as this user
        # under their previous password indefinitely (up to SESSION_TTL_HOURS).
        db.query(models.Session).filter_by(user_id=target.id).delete()
    if body.allowed_pilot_ids is not None:
        target.allowed_pilot_ids = body.allowed_pilot_ids
    if body.content_scope is not None:
        target.content_scope = body.content_scope
    if body.channel_scope is not None:
        target.channel_scope = body.channel_scope
    db.commit()
    db.refresh(target)
    return target


@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    target = db.get(models.User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "Can't delete your own account while logged in as it")
    db.query(models.Session).filter_by(user_id=target.id).delete()
    db.delete(target)
    db.commit()
    return {"ok": True}


# ---------- Pilots ----------

@app.get("/api/pilots", response_model=list[schemas.PilotOut])
def list_pilots(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    q = db.query(models.Pilot)
    if user.role == "utility":
        return q.filter(models.Pilot.id.in_(user.allowed_pilot_ids or [-1])).all()
    return q.all()


@app.post("/api/pilots", response_model=schemas.PilotOut)
def create_pilot(body: schemas.PilotCreateIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    if db.query(models.Pilot).filter_by(code=body.code).first():
        raise HTTPException(409, f"Pilot code '{body.code}' already exists")
    pilot = models.Pilot(code=body.code, name=body.name, is_master=False)
    db.add(pilot)
    db.commit()
    db.refresh(pilot)
    return pilot


@app.post("/api/pilots/{pilot_id}/clone-from-master", response_model=schemas.PilotOut)
def clone_from_master(pilot_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    pilot = db.get(models.Pilot, pilot_id)
    if not pilot:
        raise HTTPException(404, "Pilot not found")
    master = db.query(models.Pilot).filter_by(is_master=True).first()
    if not master:
        raise HTTPException(404, "No master catalog exists to clone from")
    if db.query(models.ActionItem).filter_by(pilot_id=pilot_id).first():
        raise HTTPException(409, "Pilot already has content — clone only applies to an empty pilot")
    clone_pilot_content(db, master.id, pilot.id)
    db.commit()
    return pilot


def _import_or_422(import_fn, db: Session, contents: bytes, pilot_id: int) -> dict:
    """Runs a sheet_import.py/interaction_import.py import function and turns
    any parse failure into a clear 422 instead of an opaque 500 — a bad sheet
    name, wrong column layout, or corrupt file are all user-fixable upload
    mistakes, not server errors."""
    try:
        result = import_fn(db, io.BytesIO(contents), pilot_id)
        db.commit()
        return result
    except SheetFormatError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(422, f"Couldn't process this file: {e}")


@app.post("/api/pilots/{pilot_id}/upload/actions")
async def upload_actions(pilot_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                          user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    pilot = db.get(models.Pilot, pilot_id)
    if not pilot:
        raise HTTPException(404, "Pilot not found")
    contents = await file.read()
    return _import_or_422(import_actions, db, contents, pilot_id)


@app.post("/api/pilots/{pilot_id}/upload/insights")
async def upload_insights(pilot_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                           user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    pilot = db.get(models.Pilot, pilot_id)
    if not pilot:
        raise HTTPException(404, "Pilot not found")
    contents = await file.read()
    return _import_or_422(import_insights, db, contents, pilot_id)


@app.post("/api/pilots/{pilot_id}/upload/interactions")
async def upload_interactions(pilot_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                               user: models.User = Depends(get_current_user)):
    """Accepts a CSV in the same 20-column schema as this app's own
    /api/interactions/{id}/export (and the real PE config sheet) —
    interaction_import.py resolves each row's insight_id/action_id against
    this pilot's existing Actions/Insights and upserts an InteractionRecord."""
    require_role(user, "admin")
    pilot = db.get(models.Pilot, pilot_id)
    if not pilot:
        raise HTTPException(404, "Pilot not found")
    contents = await file.read()
    return _import_or_422(import_interactions, db, contents, pilot_id)


@app.delete("/api/pilots/{pilot_id}")
def delete_pilot(pilot_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin")
    pilot = db.get(models.Pilot, pilot_id)
    if not pilot:
        raise HTTPException(404, "Pilot not found")
    if pilot.is_master:
        raise HTTPException(400, "Can't delete the Master Catalog")
    # Interaction records reference actions/insights by id directly (no ORM
    # cascade wired for that FK) — clear them explicitly before the cascade
    # deletes the actions/insights themselves, or they'd become dangling rows.
    db.query(models.InteractionRecord).filter_by(pilot_id=pilot_id).delete()
    db.delete(pilot)  # cascades to its actions/insights (see models.py relationship cascade)
    db.commit()
    return {"ok": True}


# ---------- Actions ----------

@app.get("/api/pilots/{pilot_id}/actions")
def list_actions(pilot_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    check_pilot_access(user, pilot_id, "actions")
    rows = db.query(models.ActionItem).filter_by(pilot_id=pilot_id).all()
    perms = resolve_action_permissions(user.role, user.channel_scope if user.role == "utility" else None)
    return [filter_response(r, perms, ACTION_ALWAYS_INCLUDED) for r in rows]


@app.get("/api/actions/{action_id}")
def get_action(action_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obj = db.get(models.ActionItem, action_id)
    if not obj:
        raise HTTPException(404, "Action not found")
    check_pilot_access(user, obj.pilot_id, "actions")
    perms = resolve_action_permissions(user.role, user.channel_scope if user.role == "utility" else None)
    return filter_response(obj, perms, ACTION_ALWAYS_INCLUDED)


@app.get("/api/actions/{action_id}/review")
def review_action(action_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Always renders the Utility perspective, regardless of who's asking —
    "what would a utility account see." Fixed 2026-07-08: this used to
    hardcode action_editable_fields("tpm_csm") (the wrong role's EDIT
    allowlist, not Utility's VIEW set) and ignore channel_scope entirely, so
    a real utility account hitting this endpoint directly got MORE fields
    than their actual scope allows. Now: a calling utility account gets
    their own real channel_scope; an internal caller (admin/tpm_csm, using
    the "Preview utility-review view" button) gets the full "both channels"
    utility view, since there's no specific utility account to reference
    during a generic preview."""
    obj = db.get(models.ActionItem, action_id)
    if not obj:
        raise HTTPException(404, "Action not found")
    check_pilot_access(user, obj.pilot_id, "actions")
    channel_scope = user.channel_scope if user.role == "utility" else "both"
    perms = resolve_action_permissions("utility", channel_scope)
    return filter_response(obj, perms, ACTION_ALWAYS_INCLUDED) | {"action_id": obj.action_id}


@app.patch("/api/actions/{action_id}", response_model=schemas.ActionOut)
def update_action(action_id: int, body: schemas.UpdateFieldsIn, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    obj = db.get(models.ActionItem, action_id)
    if not obj:
        raise HTTPException(404, "Action not found")
    check_pilot_access(user, obj.pilot_id, "actions")
    if obj.status == "published":
        raise HTTPException(409, "This action is Published — Unlock it first before editing.")
    allowed = action_editable_fields(user.role, user.channel_scope)
    if "tag_string" in body.fields:
        raise HTTPException(403, "tag_string is generated from the structured tag fields — edit those instead")
    for field, value in body.fields.items():
        if field not in allowed:
            raise HTTPException(403, f"'{field}' is not editable by role '{user.role}'")
        if err := validation.validate_field_type(field, value, validation.ACTION_FIELD_TYPES):
            raise HTTPException(422, err)
        log_change(db, "action_item", action_id, field, getattr(obj, field), value, user.role)
        setattr(obj, field, value)
    if set(body.fields) & (permissions.ACTION_TAG_FIELDS | {"appliance"}):
        old_tag_string = obj.tag_string
        obj.tag_string = build_tag_string(obj)
        log_change(db, "action_item", action_id, "tag_string", old_tag_string, obj.tag_string, user.role)
    # An edit invalidates whatever QA review already happened — revert to
    # Draft so it goes through /submit again rather than silently staying
    # "Ready for QA" with content nobody's re-reviewed. Only fires on an
    # actual field change, and never for Modified (that's already the
    # correct "edited, needs re-review" state for a previously-Published item).
    if body.fields and obj.status == "ready_for_qa":
        log_change(db, "action_item", action_id, "status", obj.status, "draft", user.role)
        obj.status = "draft"
    db.commit()
    db.refresh(obj)
    return obj


@app.post("/api/actions/{action_id}/validate")
def validate_action_endpoint(action_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_not_utility(user)
    obj = db.get(models.ActionItem, action_id)
    if not obj:
        raise HTTPException(404, "Action not found")
    return {"issues": validation.validate_action(obj)}


@app.post("/api/actions/{action_id}/submit")
def submit_action(action_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Moves Draft or Modified -> Ready for QA. Open to all three roles
    (2026-07-06) — Utility accounts may push their own pilot's content
    forward for review, they just can't Publish it (Admin-only, see
    publish_actions below). Response is role-filtered (2026-07-08 fix) — this
    endpoint used to declare response_model=schemas.ActionOut, which returned
    every field to whichever role called it; now that Utility can call this
    endpoint, that would have leaked internal/tag fields over the wire even
    though the frontend never rendered them."""
    obj = db.get(models.ActionItem, action_id)
    if not obj:
        raise HTTPException(404, "Action not found")
    check_pilot_access(user, obj.pilot_id, "actions")
    if obj.status not in ("draft", "modified"):
        raise HTTPException(409, f"Only Draft or Modified actions can move to Ready for QA (current status: {obj.status})")
    issues = validation.validate_action(obj)
    if issues:
        raise HTTPException(422, {"issues": issues})
    log_change(db, "action_item", action_id, "status", obj.status, "ready_for_qa", user.role)
    obj.status = "ready_for_qa"
    db.commit()
    db.refresh(obj)
    perms = resolve_action_permissions(user.role, user.channel_scope if user.role == "utility" else None)
    return filter_response(obj, perms, ACTION_ALWAYS_INCLUDED)


@app.post("/api/actions/{action_id}/unlock", response_model=schemas.ActionOut)
def unlock_action(action_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Published -> Modified. Required before a Published action can be
    edited again — Admin or tpm_csm only (Utility never edits content)."""
    require_role(user, "admin", "tpm_csm")
    obj = db.get(models.ActionItem, action_id)
    if not obj:
        raise HTTPException(404, "Action not found")
    if obj.status != "published":
        raise HTTPException(409, f"Only Published actions can be unlocked (current status: {obj.status})")
    log_change(db, "action_item", action_id, "status", "published", "modified", user.role)
    obj.status = "modified"
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/api/actions/{action_id}")
def delete_action(action_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin", "tpm_csm")
    obj = db.get(models.ActionItem, action_id)
    if not obj:
        raise HTTPException(404, "Action not found")
    if user.role != "admin" and obj.status != "draft":
        raise HTTPException(403, "Only draft actions can be deleted by a non-admin")
    if db.query(models.InteractionRecord).filter_by(action_item_id=action_id).first():
        raise HTTPException(409, "This action is part of a merged interaction — un-merge it first")
    db.delete(obj)
    db.commit()
    return {"ok": True}


@app.post("/api/pilots/{pilot_id}/actions/publish", response_model=schemas.PublishOut)
def publish_actions(pilot_id: int, body: schemas.PublishIn, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_user)):
    """Ready for QA -> Published, in bulk, producing the sheet-shaped CSV
    export in the same format as the original master file. Admin-only —
    this is the one status transition that isn't open to every role."""
    require_role(user, "admin")
    rows = db.query(models.ActionItem).filter(
        models.ActionItem.id.in_(body.ids), models.ActionItem.pilot_id == pilot_id,
    ).all()
    eligible = [r for r in rows if r.status == "ready_for_qa"]
    skipped = [i for i in body.ids if i not in {r.id for r in eligible}]
    for obj in eligible:
        log_change(db, "action_item", obj.id, "status", "ready_for_qa", "published", user.role)
        obj.status = "published"
    csv_text = export_actions_csv(eligible)
    db.commit()
    return {
        "filename": f"pilot_{pilot_id}_actions_published.csv", "csv": csv_text,
        "published_ids": [r.id for r in eligible], "skipped_ids": skipped,
    }


@app.get("/api/pilots/{pilot_id}/actions/export")
def export_actions_sheet(pilot_id: int, statuses: str | None = None, db: Session = Depends(get_db),
                          user: models.User = Depends(get_current_user)):
    """Read-only snapshot of whichever statuses are requested (defaults to
    everything not Draft, matching the pre-2026-07-22 fixed behavior), in the
    same master-sheet CSV shape Publish produces — for checking what's ready
    without triggering Publish's Ready for QA -> Published transition.
    Admin-only, matching Publish and the rest of ADMIN_ONLY_ACTIONS' "export".
    `statuses` is a comma-separated subset of draft/ready_for_qa/published/modified."""
    require_role(user, "admin")
    status_list = statuses.split(",") if statuses else ["ready_for_qa", "published", "modified"]
    rows = db.query(models.ActionItem).filter(
        models.ActionItem.pilot_id == pilot_id, models.ActionItem.status.in_(status_list),
    ).all()
    return {"filename": f"pilot_{pilot_id}_actions_export.csv", "csv": export_actions_csv(rows)}


# ---------- Insights ----------

@app.get("/api/pilots/{pilot_id}/insights")
def list_insights(pilot_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    check_pilot_access(user, pilot_id, "insights")
    rows = db.query(models.InsightItem).filter_by(pilot_id=pilot_id).all()
    perms = resolve_insight_permissions(user.role, user.channel_scope if user.role == "utility" else None)
    return [filter_response(r, perms, INSIGHT_ALWAYS_INCLUDED) for r in rows]


@app.get("/api/insights/{insight_id}")
def get_insight(insight_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obj = db.get(models.InsightItem, insight_id)
    if not obj:
        raise HTTPException(404, "Insight not found")
    check_pilot_access(user, obj.pilot_id, "insights")
    perms = resolve_insight_permissions(user.role, user.channel_scope if user.role == "utility" else None)
    return filter_response(obj, perms, INSIGHT_ALWAYS_INCLUDED)


@app.get("/api/insights/{insight_id}/review")
def review_insight(insight_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Mirrors review_action's fix — always the Utility perspective, real
    channel_scope for an actual utility caller, "both" for an internal
    preview."""
    obj = db.get(models.InsightItem, insight_id)
    if not obj:
        raise HTTPException(404, "Insight not found")
    check_pilot_access(user, obj.pilot_id, "insights")
    channel_scope = user.channel_scope if user.role == "utility" else "both"
    perms = resolve_insight_permissions("utility", channel_scope)
    return filter_response(obj, perms, INSIGHT_ALWAYS_INCLUDED) | {"insight_id": obj.insight_id}


@app.patch("/api/insights/{insight_id}", response_model=schemas.InsightOut)
def update_insight(insight_id: int, body: schemas.UpdateFieldsIn, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_user)):
    obj = db.get(models.InsightItem, insight_id)
    if not obj:
        raise HTTPException(404, "Insight not found")
    check_pilot_access(user, obj.pilot_id, "insights")
    if obj.status == "published":
        raise HTTPException(409, "This insight is Published — Unlock it first before editing.")
    allowed = insight_editable_fields(user.role, user.channel_scope)
    if "tag_string" in body.fields:
        raise HTTPException(403, "tag_string is generated from the structured tag fields — edit those instead")
    for field, value in body.fields.items():
        if field not in allowed:
            raise HTTPException(403, f"'{field}' is not editable by role '{user.role}'")
        if err := validation.validate_field_type(field, value, validation.INSIGHT_FIELD_TYPES):
            raise HTTPException(422, err)
        log_change(db, "insight_item", insight_id, field, getattr(obj, field), value, user.role)
        setattr(obj, field, value)
    if set(body.fields) & (permissions.INSIGHT_TAG_FIELDS | {"appliance"}):
        old_tag_string = obj.tag_string
        obj.tag_string = build_insight_tag_string(obj)
        log_change(db, "insight_item", insight_id, "tag_string", old_tag_string, obj.tag_string, user.role)
    # See update_action's matching comment — an edit invalidates prior QA
    # review, so revert Ready for QA back to Draft (never for Modified).
    if body.fields and obj.status == "ready_for_qa":
        log_change(db, "insight_item", insight_id, "status", obj.status, "draft", user.role)
        obj.status = "draft"
    db.commit()
    db.refresh(obj)
    return obj


@app.post("/api/insights/{insight_id}/validate")
def validate_insight_endpoint(insight_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_not_utility(user)
    obj = db.get(models.InsightItem, insight_id)
    if not obj:
        raise HTTPException(404, "Insight not found")
    return {"issues": validation.validate_insight(obj)}


@app.post("/api/insights/{insight_id}/submit")
def submit_insight(insight_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Moves Draft or Modified -> Ready for QA. Open to all three roles,
    mirrors submit_action including its response-filtering fix."""
    obj = db.get(models.InsightItem, insight_id)
    if not obj:
        raise HTTPException(404, "Insight not found")
    check_pilot_access(user, obj.pilot_id, "insights")
    if obj.status not in ("draft", "modified"):
        raise HTTPException(409, f"Only Draft or Modified insights can move to Ready for QA (current status: {obj.status})")
    issues = validation.validate_insight(obj)
    if issues:
        raise HTTPException(422, {"issues": issues})
    log_change(db, "insight_item", insight_id, "status", obj.status, "ready_for_qa", user.role)
    obj.status = "ready_for_qa"
    db.commit()
    db.refresh(obj)
    perms = resolve_insight_permissions(user.role, user.channel_scope if user.role == "utility" else None)
    return filter_response(obj, perms, INSIGHT_ALWAYS_INCLUDED)


@app.post("/api/insights/{insight_id}/unlock", response_model=schemas.InsightOut)
def unlock_insight(insight_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Published -> Modified. Mirrors unlock_action."""
    require_role(user, "admin", "tpm_csm")
    obj = db.get(models.InsightItem, insight_id)
    if not obj:
        raise HTTPException(404, "Insight not found")
    if obj.status != "published":
        raise HTTPException(409, f"Only Published insights can be unlocked (current status: {obj.status})")
    log_change(db, "insight_item", insight_id, "status", "published", "modified", user.role)
    obj.status = "modified"
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/api/insights/{insight_id}")
def delete_insight(insight_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_role(user, "admin", "tpm_csm")
    obj = db.get(models.InsightItem, insight_id)
    if not obj:
        raise HTTPException(404, "Insight not found")
    if user.role != "admin" and obj.status != "draft":
        raise HTTPException(403, "Only draft insights can be deleted by a non-admin")
    if db.query(models.InteractionRecord).filter_by(insight_item_id=insight_id).first():
        raise HTTPException(409, "This insight is part of a merged interaction — un-merge it first")
    db.delete(obj)
    db.commit()
    return {"ok": True}


@app.post("/api/pilots/{pilot_id}/insights/publish", response_model=schemas.PublishOut)
def publish_insights(pilot_id: int, body: schemas.PublishIn, db: Session = Depends(get_db),
                      user: models.User = Depends(get_current_user)):
    """Mirrors publish_actions."""
    require_role(user, "admin")
    rows = db.query(models.InsightItem).filter(
        models.InsightItem.id.in_(body.ids), models.InsightItem.pilot_id == pilot_id,
    ).all()
    eligible = [r for r in rows if r.status == "ready_for_qa"]
    skipped = [i for i in body.ids if i not in {r.id for r in eligible}]
    for obj in eligible:
        log_change(db, "insight_item", obj.id, "status", "ready_for_qa", "published", user.role)
        obj.status = "published"
    csv_text = export_insights_csv(eligible)
    db.commit()
    return {
        "filename": f"pilot_{pilot_id}_insights_published.csv", "csv": csv_text,
        "published_ids": [r.id for r in eligible], "skipped_ids": skipped,
    }


@app.get("/api/pilots/{pilot_id}/insights/export")
def export_insights_sheet(pilot_id: int, statuses: str | None = None, db: Session = Depends(get_db),
                           user: models.User = Depends(get_current_user)):
    """Mirrors export_actions_sheet."""
    require_role(user, "admin")
    status_list = statuses.split(",") if statuses else ["ready_for_qa", "published", "modified"]
    rows = db.query(models.InsightItem).filter(
        models.InsightItem.pilot_id == pilot_id, models.InsightItem.status.in_(status_list),
    ).all()
    return {"filename": f"pilot_{pilot_id}_insights_export.csv", "csv": export_insights_csv(rows)}


# ---------- Interactions (Admin merge — replaces Script 1) ----------

def _interaction_out(interaction: models.InteractionRecord) -> dict:
    out = {
        "id": interaction.id, "pilot_id": interaction.pilot_id,
        "action_item_id": interaction.action_item_id, "insight_item_id": interaction.insight_item_id,
        "status": interaction.status, "export_payload": interaction.export_payload,
        "created_by_role": interaction.created_by_role, "created_at": interaction.created_at,
    }
    out.update(interaction_logic.compute_fields(interaction))
    return out


def _interactions_csv(rows: list[models.InteractionRecord]) -> str:
    """The 20-column PE config schema for a set of interactions — shared by
    the Download Sheet export and the Publish Selected action, same pattern
    as export_actions_csv/export_insights_csv for the other two entities."""
    payload = io.StringIO()
    writer = csv.writer(payload)
    writer.writerow(interaction_logic.FIELDS)
    for row in rows:
        fields = interaction_logic.compute_fields(row)
        writer.writerow([sanitize_csv_cell(fields[f]) for f in interaction_logic.FIELDS])
    return payload.getvalue()


@app.get("/api/pilots/{pilot_id}/interactions", response_model=list[schemas.InteractionOut])
def list_interactions(pilot_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_not_utility(user)
    rows = db.query(models.InteractionRecord).filter_by(pilot_id=pilot_id).all()
    return [_interaction_out(r) for r in rows]


@app.post("/api/interactions", response_model=schemas.InteractionOut)
def create_interaction(body: schemas.InteractionCreateIn, db: Session = Depends(get_db),
                        user: models.User = Depends(get_current_user)):
    require_role(user, "admin")

    action = db.get(models.ActionItem, body.action_item_id)
    insight = db.get(models.InsightItem, body.insight_item_id)
    if not action or not insight:
        raise HTTPException(404, "Action or Insight not found")

    if action.pilot_id != insight.pilot_id:
        raise HTTPException(422, "Action and Insight belong to different pilots — can't merge across pilots")

    # seasonal_suffix=None: manual single-merge always creates the base
    # pairing — a co-existing bulk-created seasonal variant of the same
    # action+insight (see bulk_merge_interactions) isn't a duplicate of this.
    existing = db.query(models.InteractionRecord).filter_by(
        action_item_id=action.id, insight_item_id=insight.id, seasonal_suffix=None,
    ).first()
    if existing:
        raise HTTPException(409, f"This Action + Insight pair is already merged (interaction #{existing.id})")

    pairing_issues = validation.validate_pairing(action, insight)
    if pairing_issues:
        raise HTTPException(422, {"issues": pairing_issues})

    record = models.InteractionRecord(
        pilot_id=action.pilot_id,
        action_item_id=action.id,
        insight_item_id=insight.id,
        status="draft",
        created_by_role=user.role,
    )
    # The interaction's own Draft/Ready-for-QA/Published/Modified status
    # (2026-07-22) is independent of the linked Action/Insight's own status —
    # merging or un-merging never touches those.
    db.add(record)
    db.flush()  # populate record.id before logging
    log_change(db, "interaction_record", record.id, "status", None, "draft", user.role)
    db.commit()
    db.refresh(record)
    return _interaction_out(record)


@app.post("/api/pilots/{pilot_id}/interactions/bulk-merge", response_model=schemas.BulkMergeOut)
def bulk_merge_interactions(pilot_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Runs the full pairing rule engine (interaction_logic.py — ported from
    PE's generate_nbi_configs.py) over every Action+Insight in this pilot and
    creates an InteractionRecord for every pair that passes and isn't already
    merged. Creates immediately, no preview step (by design)."""
    require_role(user, "admin")

    actions = db.query(models.ActionItem).filter_by(pilot_id=pilot_id).all()
    insights = db.query(models.InsightItem).filter_by(pilot_id=pilot_id).all()
    candidates = interaction_logic.generate_candidates(actions, insights)

    existing_pairs = {
        (r.action_item_id, r.insight_item_id, r.seasonal_suffix)
        for r in db.query(models.InteractionRecord).filter_by(pilot_id=pilot_id).all()
    }

    created = 0
    new_records = []
    for action, insight, seasonal_suffix in candidates:
        key = (action.id, insight.id, seasonal_suffix)
        if key in existing_pairs:
            continue
        record = models.InteractionRecord(
            pilot_id=pilot_id, action_item_id=action.id, insight_item_id=insight.id,
            status="draft", created_by_role=user.role, seasonal_suffix=seasonal_suffix,
        )
        db.add(record)
        new_records.append(record)
        existing_pairs.add(key)
        created += 1
    db.flush()  # populate .id on each new record before logging
    for record in new_records:
        log_change(db, "interaction_record", record.id, "status", None, "draft", user.role)
    db.commit()

    return {
        "created": created,
        "skipped_existing": len(candidates) - created,
        "candidates_considered": len(candidates),
    }


@app.post("/api/pilots/{pilot_id}/interactions/publish", response_model=schemas.PublishOut)
def publish_interactions(pilot_id: int, body: schemas.PublishIn, db: Session = Depends(get_db),
                          user: models.User = Depends(get_current_user)):
    """Ready for QA -> Published, in bulk — mirrors publish_actions/
    publish_insights, producing the same 20-column CSV the Download Sheet
    button does (filtered to just the newly-published rows)."""
    require_role(user, "admin")
    rows = db.query(models.InteractionRecord).filter(
        models.InteractionRecord.id.in_(body.ids), models.InteractionRecord.pilot_id == pilot_id,
    ).all()
    eligible = [r for r in rows if r.status == "ready_for_qa"]
    skipped = [i for i in body.ids if i not in {r.id for r in eligible}]
    for obj in eligible:
        log_change(db, "interaction_record", obj.id, "status", obj.status, "published", user.role)
        obj.status = "published"
    csv_text = _interactions_csv(eligible)
    db.commit()
    return {
        "filename": f"pilot_{pilot_id}_interactions_published.csv", "csv": csv_text,
        "published_ids": [r.id for r in eligible], "skipped_ids": skipped,
    }


@app.get("/api/pilots/{pilot_id}/interactions/export")
def export_interactions_sheet(pilot_id: int, statuses: str | None = None, db: Session = Depends(get_db),
                               user: models.User = Depends(get_current_user)):
    """Mirrors export_actions_sheet/export_insights_sheet — a pilot-level,
    status-filtered download replacing the old per-interaction /export
    (removed 2026-07-22 in favor of this one consistent download surface)."""
    require_role(user, "admin")
    status_list = statuses.split(",") if statuses else ["ready_for_qa", "published", "modified"]
    rows = db.query(models.InteractionRecord).filter(
        models.InteractionRecord.pilot_id == pilot_id, models.InteractionRecord.status.in_(status_list),
    ).all()
    return {"filename": f"pilot_{pilot_id}_interactions_export.csv", "csv": _interactions_csv(rows)}


@app.patch("/api/interactions/{interaction_id}", response_model=schemas.InteractionOut)
def update_interaction(interaction_id: int, body: schemas.InteractionUpdateIn, db: Session = Depends(get_db),
                        user: models.User = Depends(get_current_user)):
    """Edits the 3 per-interaction overrides only — never touches the shared
    source Action/Insight record (see interaction_logic.compute_fields)."""
    require_role(user, "admin")
    obj = db.get(models.InteractionRecord, interaction_id)
    if not obj:
        raise HTTPException(404, "Interaction not found")
    if obj.status == "published":
        raise HTTPException(409, "This interaction is Published — Unlock it first before editing.")

    changed = False
    if body.insight_semantic is not None:
        log_change(db, "interaction_record", interaction_id, "insight_semantic_override",
                   obj.insight_semantic_override, body.insight_semantic, user.role)
        obj.insight_semantic_override = body.insight_semantic
        changed = True
    if body.insight_text is not None:
        log_change(db, "interaction_record", interaction_id, "insight_text_override",
                   obj.insight_text_override, body.insight_text, user.role)
        obj.insight_text_override = body.insight_text
        changed = True
    if body.action is not None:
        log_change(db, "interaction_record", interaction_id, "action_text_override",
                   obj.action_text_override, body.action, user.role)
        obj.action_text_override = body.action
        changed = True

    # Same rule as ActionItem/InsightItem's generic PATCH: an edit invalidates
    # whatever QA review already happened.
    if changed and obj.status == "ready_for_qa":
        log_change(db, "interaction_record", interaction_id, "status", obj.status, "draft", user.role)
        obj.status = "draft"

    db.commit()
    db.refresh(obj)
    return _interaction_out(obj)


@app.post("/api/interactions/{interaction_id}/submit", response_model=schemas.InteractionOut)
def submit_interaction(interaction_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Moves Draft or Modified -> Ready for QA. Admin-only, unlike Actions/
    Insights' /submit — Interactions have no Utility-visible equivalent."""
    require_role(user, "admin")
    obj = db.get(models.InteractionRecord, interaction_id)
    if not obj:
        raise HTTPException(404, "Interaction not found")
    if obj.status not in ("draft", "modified"):
        raise HTTPException(409, f"Only Draft or Modified interactions can move to Ready for QA (current status: {obj.status})")
    log_change(db, "interaction_record", interaction_id, "status", obj.status, "ready_for_qa", user.role)
    obj.status = "ready_for_qa"
    db.commit()
    db.refresh(obj)
    return _interaction_out(obj)


@app.post("/api/interactions/{interaction_id}/unlock", response_model=schemas.InteractionOut)
def unlock_interaction(interaction_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Published -> Modified. Required before a Published interaction's
    overrides can be edited again."""
    require_role(user, "admin")
    obj = db.get(models.InteractionRecord, interaction_id)
    if not obj:
        raise HTTPException(404, "Interaction not found")
    if obj.status != "published":
        raise HTTPException(409, f"Only Published interactions can be unlocked (current status: {obj.status})")
    log_change(db, "interaction_record", interaction_id, "status", obj.status, "modified", user.role)
    obj.status = "modified"
    db.commit()
    db.refresh(obj)
    return _interaction_out(obj)


@app.delete("/api/interactions/{interaction_id}")
def unmerge_interaction(interaction_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Un-merge: deletes the InteractionRecord. Doesn't touch the linked
    action/insight's QA status (see create_interaction) — they can be
    re-merged with a different pairing at any status."""
    require_role(user, "admin")
    obj = db.get(models.InteractionRecord, interaction_id)
    if not obj:
        raise HTTPException(404, "Interaction not found")
    log_change(db, "interaction_record", interaction_id, "status", obj.status, "deleted", user.role)
    db.delete(obj)
    db.commit()
    return {"ok": True}


# ---------- Audit log ----------

@app.get("/api/audit-log", response_model=list[schemas.AuditLogOut])
def get_audit_log(entity_type: str | None = None, entity_id: int | None = None,
                   db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_not_utility(user)
    q = db.query(models.AuditLog)
    if entity_type:
        q = q.filter_by(entity_type=entity_type)
    if entity_id:
        q = q.filter_by(entity_id=entity_id)
    return q.order_by(models.AuditLog.changed_at.desc()).limit(200).all()


# ---------- Frontend static serving (single-process deployment) ----------
# `npm run build` output, mounted so uvicorn serves the SPA on the same port
# as the API — no separate frontend dev server needed. Must stay last: routes
# registered above take precedence over this catch-all.

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
FRONTEND_DIST_RESOLVED = FRONTEND_DIST.resolve()

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        # full_path is attacker-controlled and Starlette's {...:path} converter
        # does not normalize ".."/absolute-looking segments in it — resolve()
        # collapses those, and is_relative_to() enforces the same containment
        # StaticFiles does internally for the /assets mount above. Anything
        # that resolves outside FRONTEND_DIST (real traversal, not a genuine
        # SPA route) falls through to index.html like any other non-matching
        # path, rather than erroring.
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_relative_to(FRONTEND_DIST_RESOLVED) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
