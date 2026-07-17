"""
Validation rules lifted directly from limits already written into the master
sheet's column headers — not invented. See Old NBI Automation Tool.md.
"""

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
