"""Imports an Interactions sheet (the same 20-column PE config schema this
app's own /api/interactions/{id}/export produces — see interaction_logic.py)
into a pilot. Mirrors sheet_import.py's upsert-on-re-upload approach, adapted
for InteractionRecord: matched by (action, insight, seasonal_suffix) rather
than a single natural-key id, since one Action can back two interactions (its
base pairing and its synthetic seasonal-variant pairing).
"""
import pandas as pd

from . import models
from .interaction_logic import seasonal_variant_for
from .sheet_import import SheetFormatError


def _first(v):
    if v is None or pd.isna(v):
        return None
    v = str(v).strip()
    return v or None


def _resolve_action(raw_action_id: str, pilot_id: int, db):
    """Returns (ActionItem, seasonal_suffix) for a sheet row's action_id,
    which may carry a _S/_W seasonal suffix (see interaction_logic.compute_fields's
    nbi_id/action_id). Tries an exact match first — most action_ids don't end
    in _S/_W at all — before falling back to stripping a recognized suffix."""
    exact = db.query(models.ActionItem).filter_by(pilot_id=pilot_id, action_id=raw_action_id).first()
    if exact:
        return exact, None

    for suffix in ("S", "W"):
        marker = f"_{suffix}"
        if raw_action_id.endswith(marker):
            base = db.query(models.ActionItem).filter_by(
                pilot_id=pilot_id, action_id=raw_action_id[: -len(marker)],
            ).first()
            if base and (variant := seasonal_variant_for(base)) and variant[0] == suffix:
                return base, suffix
    return None, None


def import_interactions(db, path_or_buffer, pilot_id: int) -> dict:
    try:
        df = pd.read_csv(path_or_buffer)
    except Exception as e:
        raise SheetFormatError(f"Couldn't read this file as a CSV ({e}). Make sure it's a valid, uncorrupted .csv file.") from e

    missing = {"insight_id", "action_id"} - set(df.columns)
    if missing:
        raise SheetFormatError(
            f"This file is missing required column(s): {', '.join(sorted(missing))}. "
            "Make sure it's in the same 20-column format this app's own Interaction export produces."
        )

    imported = 0
    unmatched = 0
    skipped_published = 0
    for _, row in df.iterrows():
        insight_id = _first(row.get("insight_id"))
        raw_action_id = _first(row.get("action_id"))
        if not insight_id or not raw_action_id:
            continue

        insight = db.query(models.InsightItem).filter_by(pilot_id=pilot_id, insight_id=insight_id).first()
        action, seasonal_suffix = _resolve_action(raw_action_id, pilot_id, db)
        if not insight or not action:
            unmatched += 1
            continue

        record = db.query(models.InteractionRecord).filter_by(
            pilot_id=pilot_id, action_item_id=action.id, insight_item_id=insight.id, seasonal_suffix=seasonal_suffix,
        ).first()
        if record and record.status == "published":
            # Mirrors sheet_import.py's rule for Actions/Insights: a Published
            # item must be explicitly Unlocked before its content changes.
            skipped_published += 1
            continue
        was_ready_for_qa = bool(record and record.status == "ready_for_qa")
        if not record:
            record = models.InteractionRecord(
                pilot_id=pilot_id, action_item_id=action.id, insight_item_id=insight.id,
                seasonal_suffix=seasonal_suffix, status="draft", created_by_role="admin",
            )
            db.add(record)

        # The sheet is authoritative for these 3 fields, same as an Actions/
        # Insights sheet upload is authoritative for its content fields —
        # stored as this interaction's own override, never touching the
        # shared source Action/Insight.
        record.insight_semantic_override = _first(row.get("insight_semantic"))
        record.insight_text_override = _first(row.get("insight_text"))
        record.action_text_override = _first(row.get("action"))
        if was_ready_for_qa:
            # Same rule the generic PATCH endpoint enforces: an edit
            # invalidates whatever QA review already happened.
            record.status = "draft"
        imported += 1
    return {"imported": imported, "unmatched": unmatched, "skipped_published": skipped_published}
