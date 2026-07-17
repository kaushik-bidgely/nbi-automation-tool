"""
Read-only schema/vocabulary reference for ActionItem/InsightItem, assembled
live from the actual code — never a separate copy that could drift. Powers
the admin-only "Schema" page (GET /api/schema, frontend/src/pages/SchemaReference.tsx).

Deliberately not editable through the app: rbac_matrix.py's own docstring
states the field matrix is "kept as a plain Python module, not a DB table, on
purpose... a change here is a reviewable git diff, not a runtime edit with no
audit trail" — this module preserves that by only ever reading, never writing.

Combines four existing sources of truth, each read live, none duplicated:
  - rbac_matrix.py  — category, channel, hand-authored description
  - tag_logic.py    — accepted-value vocabularies for structured tag fields
  - sheet_export.py — appliance codes (a different file than the other
                       vocabs — this module lives standalone rather than in
                       either tag_logic.py or sheet_export.py, since
                       sheet_export.py already imports tag_logic.py and a
                       registry needing both would create a cycle)
  - validation.py   — char limits and required-for-submit fields
  - models.py       — column types, via direct SQLAlchemy introspection
"""
from __future__ import annotations

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text

from . import validation
from .models import ActionItem, InsightItem
from .rbac_matrix import ACTION_FIELD_MATRIX, INSIGHT_FIELD_MATRIX, FieldRule
from .sheet_export import ACTION_APPLIANCE_FLAGS, INSIGHT_APPLIANCE_FLAGS
from .tag_logic import (
    RECO_TYPES, BENEFIT_SCALE, COST_SCALE, EFFORT_SCALE, INCOME_LEVELS, OWNERSHIP, SEASONS, PERSONAS,
    COMPARISON_TYPES, DIRECTIONS, DATA_SOURCES, INSIGHT_SEASONS, TOU_PERIODS, GENERIC_INSIGHT_TYPES,
    CHALLENGE_STATUSES,
)

ACTION_FIELD_VOCAB: dict[str, dict[str, str]] = {
    "reco_type": RECO_TYPES,
    "benefit_scale": BENEFIT_SCALE,
    "cost_scale": COST_SCALE,
    "effort_scale": EFFORT_SCALE,
    "income_level": INCOME_LEVELS,
    "ownership": OWNERSHIP,
    "season": SEASONS,
    "persona": PERSONAS,
    # sheet_export.py's labels carry the raw sheet-header text ("Appliance =
    # cooling") — strip the redundant prefix for a cleaner tooltip here.
    "appliance": {code: label.removeprefix("Appliance = ") for code, label in ACTION_APPLIANCE_FLAGS},
}

# Fields tracked in the matrix but never actually rendered anywhere in the
# app's regular UI (neither the ActionsList/InsightsList condensed table nor
# the full ActionEditor/InsightEditor page). This is a fact about the
# frontend TSX components, which can't be introspected from Python the way
# category/type/vocab can — hand-maintained here, same reviewable-git-diff
# principle as everything else in this file. Verified 2026-07-15 by checking
# every field in both matrices against ActionEditor.tsx/InsightEditor.tsx's
# FieldGroup/TagEditor calls: only updated_at is unrendered on either entity
# (tag_string IS shown, as TagEditor's live-generated preview, so it's not in
# this set). Revisit this list if a future UI change adds or drops a field.
FIELDS_NOT_SHOWN_IN_UI = {"updated_at"}

INSIGHT_FIELD_VOCAB: dict[str, dict[str, str]] = {
    "comparison_type": COMPARISON_TYPES,
    "direction": DIRECTIONS,
    "data_source": DATA_SOURCES,
    "season": INSIGHT_SEASONS,
    "tou_period": TOU_PERIODS,
    "generic_insight_type": GENERIC_INSIGHT_TYPES,
    "challenge_status": CHALLENGE_STATUSES,
    # stored_code is what's actually written to InsightItem.appliance — NOT
    # flag_value, which is the CSV-export-only lt/li quirk (see
    # sheet_export.py's INSIGHT_APPLIANCE_FLAGS) and would be misleading to
    # surface here as if it were an accepted field value.
    "appliance": {
        stored_code: label.removeprefix("Appliance = ")
        for stored_code, _flag_value, label in INSIGHT_APPLIANCE_FLAGS
    },
}


def _column_type_and_list(model, field: str) -> tuple[str, bool]:
    """Derives a field's type name and whether it's list-valued straight from
    the real SQLAlchemy column — never hand-maintained, so it can't drift
    from models.py. Every JSON column in this schema happens to be
    list-valued, so list_valued falls out of the type check for free."""
    col_type = model.__table__.columns[field].type
    if isinstance(col_type, JSON):
        return "json", True
    if isinstance(col_type, Boolean):
        return "boolean", False
    if isinstance(col_type, Integer):
        return "integer", False
    if isinstance(col_type, DateTime):
        return "datetime", False
    if isinstance(col_type, Text):  # check before String — Text is a String subclass
        return "text", False
    if isinstance(col_type, String):
        return "string", False
    return type(col_type).__name__.lower(), False


def _build_entries(
    matrix: list[FieldRule], model, vocab_map: dict[str, dict[str, str]],
    char_limits: dict[str, int], required_for_submit: list[str],
) -> list[dict]:
    entries = []
    for rule in matrix:
        type_name, list_valued = _column_type_and_list(model, rule.field)
        entries.append({
            "field": rule.field,
            "category": rule.category,
            "channel": rule.channel,
            "description": rule.description,
            "type": type_name,
            "list_valued": list_valued,
            "accepted_values": vocab_map.get(rule.field),
            "char_limit": char_limits.get(rule.field),
            "required_for_submit": rule.field in required_for_submit,
            "shown_in_ui": rule.field not in FIELDS_NOT_SHOWN_IN_UI,
        })
    return entries


def get_action_schema() -> list[dict]:
    return _build_entries(
        ACTION_FIELD_MATRIX, ActionItem, ACTION_FIELD_VOCAB,
        validation.ACTION_CHAR_LIMITS, validation.ACTION_REQUIRED_FOR_SUBMIT,
    )


def get_insight_schema() -> list[dict]:
    return _build_entries(
        INSIGHT_FIELD_MATRIX, InsightItem, INSIGHT_FIELD_VOCAB,
        validation.INSIGHT_CHAR_LIMITS, validation.INSIGHT_REQUIRED_FOR_SUBMIT,
    )
