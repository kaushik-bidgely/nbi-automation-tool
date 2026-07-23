"""
Validation rules lifted directly from limits already written into the master
sheet's column headers — not invented. See Old NBI Automation Tool.md.
"""
from __future__ import annotations

ACTION_CHAR_LIMITS = {
    "short_desc": 110,
    "title": 55,
}

INSIGHT_CHAR_LIMITS = {
    "insight_semantic": 135,  # paper channel limit
}

ACTION_REQUIRED_FOR_SUBMIT = [
    "action_id", "nbi_family", "nbi_type", "fuel_type", "appliance",
    "short_desc", "title",
]

INSIGHT_REQUIRED_FOR_SUBMIT = [
    "insight_id", "appliance", "fuel_type", "channel", "insight_semantic",
]


def validate_action(action) -> list[str]:
    issues = []
    for field, limit in ACTION_CHAR_LIMITS.items():
        val = getattr(action, field) or ""
        if len(val) > limit:
            issues.append(f"'{field}' is {len(val)} chars, exceeds the {limit}-char limit")
    for field in ACTION_REQUIRED_FOR_SUBMIT:
        if not getattr(action, field):
            issues.append(f"'{field}' is required before submit")
    return issues


def validate_insight(insight) -> list[str]:
    issues = []
    for field, limit in INSIGHT_CHAR_LIMITS.items():
        val = getattr(insight, field) or ""
        if len(val) > limit:
            issues.append(f"'{field}' is {len(val)} chars, exceeds the {limit}-char limit")
    for field in INSIGHT_REQUIRED_FOR_SUBMIT:
        if not getattr(insight, field):
            issues.append(f"'{field}' is required before submit")
    return issues


ACTION_FIELD_TYPES: dict[str, type] = {
    "diy": bool, "selfie": bool,
    "strike_low": int, "strike_high": int,
    "income_level": list, "ownership": list, "season": list, "persona": list,
}

INSIGHT_FIELD_TYPES: dict[str, type] = {
    "generic_insight": bool,
    "min_value": int, "max_value": int,
    "season": list, "tou_period": list,
}


def validate_field_type(field: str, value, type_map: dict) -> str | None:
    """Returns an error string if value's type doesn't match what the column
    behind `field` expects, else None — every editable field defaults to
    plain string unless listed in type_map. Guards the generic PATCH
    endpoint's setattr() against type-confusion writes (e.g. a raw string
    into a JSON-list column), which SQLAlchemy/SQLite won't reject on their
    own and which only surfaces later as a 500 on the *next* read, after the
    bad value is already committed."""
    if value is None:
        return None
    expected = type_map.get(field, str)
    if expected is bool:
        if not isinstance(value, bool):
            return f"'{field}' expects a boolean, got {type(value).__name__}"
    elif expected is int:
        if not isinstance(value, int) or isinstance(value, bool):
            return f"'{field}' expects an integer, got {type(value).__name__}"
    elif expected is list:
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            return f"'{field}' expects a list of strings, got {type(value).__name__}"
    elif not isinstance(value, str):
        return f"'{field}' expects a string, got {type(value).__name__}"
    return None


def validate_pairing(action, insight) -> list[str]:
    """Mirrors the G4 gap: Script 1 may miss valid insight-action pairings.
    Minimal v1 check — same appliance and fuel type."""
    issues = []
    if action.appliance and insight.appliance and action.appliance != insight.appliance:
        issues.append(
            f"Appliance mismatch: action is '{action.appliance}', insight is '{insight.appliance}'"
        )
    if action.fuel_type and insight.fuel_type and action.fuel_type != insight.fuel_type:
        issues.append(
            f"Fuel type mismatch: action is '{action.fuel_type}', insight is '{insight.fuel_type}'"
        )
    return issues
