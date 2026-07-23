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


# Interactions have no rbac_matrix.py equivalent — there's no per-field, per-role
# permission split (the whole entity is admin-edit / tpm_csm-view / utility-none,
# see main.py's interaction endpoints), and most fields are computed live from
# the linked Action/Insight rather than being real InteractionRecord columns
# (see interaction_logic.compute_fields). So this is hand-authored rather than
# introspected — the `assert` below at least guarantees it can't silently drift
# out of sync with the real field list interaction_logic.py actually computes.
INTERACTION_FIELD_DOCS: dict[str, tuple[str, str]] = {
    "id": ("generated", "This interaction record's own database id."),
    "pilot_id": ("generated", "The pilot this interaction belongs to."),
    "nbi_id": ("generated", "insight_id + \"_\" + action_id — the unique key for this pairing, matching the real PE config sheet's nbi_id column."),
    "insight_id": ("internal", "The paired Insight's natural-key ID."),
    "action_id": ("internal", "The paired Action's natural-key ID — includes the _S/_W seasonal suffix for a seasonal-variant pairing (see nbi_type)."),
    "insight_semantic": ("content", "Editable per-interaction — defaults to the Insight's own Insight Semantic until overridden here; overriding it does not change the source Insight."),
    "insight_text": ("content", "Editable per-interaction — defaults to the Insight's own Insight Text until overridden here; overriding it does not change the source Insight."),
    "action": ("content", "Editable per-interaction — defaults to the Action's own description until overridden here; overriding it does not change the source Action."),
    "tag_insight": ("internal", "The paired Insight's generated tag string."),
    "tag_action": ("internal", "The paired Action's generated tag string."),
    "tag_generic": ("internal", "The shared appliance code if the Action and Insight's appliance fields match, else blank."),
    "tag_objective": ("internal", "The Action's utility-objective tag (e.g. ee)."),
    "var_i_name": ("internal", "The Insight's variable name — percentage | percentile | dollar."),
    "filter_utility": ("generated", "Always blank — the real PE generation script hardcodes this, it's never derived from source data."),
    "filter_ownership": ("internal", "The Action's ownership filter."),
    "filter_season": ("internal", "The Action's season filter."),
    "nbi_family": ("internal", "The Action's NBI family (e.g. EE)."),
    "nbi_type": ("internal", "The Action's NBI type — becomes SummerSeasonal/WinterSeasonal/SummerProgram/WinterProgram for a seasonal-variant pairing, else the Action's own value."),
    "nbi_fuel_type": ("internal", "The Action's fuel type — ELECTRIC | GAS."),
    "nbi_appliance": ("internal", "Same as tag_generic — the shared appliance code."),
    "min": ("internal", "The paired Insight's min_value, if any."),
    "max": ("internal", "The paired Insight's max_value, if any."),
    "seasonal_suffix": ("generated", "S | W if this interaction represents the synthetic seasonal variant of its Action, else blank."),
    "status": ("generated", "merged | exported — whether this interaction has been through the CSV export step."),
    "created_by_role": ("generated", "The role of whoever created this interaction."),
    "created_at": ("generated", "When this interaction was created."),
}


def get_interaction_schema() -> list[dict]:
    from .interaction_logic import FIELDS as INTERACTION_COMPUTED_FIELDS

    all_fields = ["id", "pilot_id", *INTERACTION_COMPUTED_FIELDS, "seasonal_suffix", "status", "created_by_role", "created_at"]
    assert all(f in INTERACTION_FIELD_DOCS for f in all_fields), "undocumented interaction field"

    return [
        {
            "field": field,
            "category": INTERACTION_FIELD_DOCS[field][0],
            "channel": None,
            "description": INTERACTION_FIELD_DOCS[field][1],
            "type": "integer" if field in ("id", "pilot_id", "min", "max") else ("datetime" if field == "created_at" else "string"),
            "list_valued": False,
            "accepted_values": None,
            "char_limit": None,
            "required_for_submit": False,
            "shown_in_ui": True,
        }
        for field in all_fields
    ]
