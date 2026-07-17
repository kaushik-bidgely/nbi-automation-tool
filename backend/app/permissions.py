"""
Field-level permission logic. As of 2026-07-08 this is a thin resolver layer
over the real source of truth, backend/app/rbac_matrix.py — see that module
for the actual per-field, per-role matrix and the category rules behind it.
This file used to hand-maintain the equivalent sets directly; keeping the
function names/signatures the same here means main.py's call sites didn't
need to change.

Channel/table-view grouping constants (ACTION_EMAIL_FIELDS etc.) stay here
as pure UI-layout metadata — which fields appear under the Email/Paper
toggle in the condensed table view. They are NOT permission data anymore
(that's rbac_matrix.py's FieldRule.channel) — just presentation grouping,
derived from the same matrix so the two can't drift apart.
"""
from __future__ import annotations

from . import rbac_matrix as rbac

ACTION_EMAIL_FIELDS = {r.field for r in rbac.ACTION_FIELD_MATRIX if r.channel == "email"}
ACTION_PAPER_TABLE_FIELDS = {"short_desc", "title"}  # condensed table shows only these 2 of the 3 paper content fields
ACTION_PAPER_FIELDS = {r.field for r in rbac.ACTION_FIELD_MATRIX if r.channel == "paper"}

INSIGHT_EMAIL_FIELDS = {r.field for r in rbac.INSIGHT_FIELD_MATRIX if r.channel == "email"}
INSIGHT_PAPER_FIELDS = {r.field for r in rbac.INSIGHT_FIELD_MATRIX if r.channel == "paper"}

# Which structured tag fields trigger tag_string regeneration on save (see
# update_action/update_insight in main.py) — a save-time concern, not a
# permission level, so it stays a plain field-name set rather than living in
# rbac_matrix.py. Must exactly match the fields tag_logic.build_tag_string /
# build_insight_tag_string read from the item (appliance is checked separately
# by the caller since it's an identity field, not a "tag").
ACTION_TAG_FIELDS = {
    "reco_type", "benefit_scale", "cost_scale", "effort_scale", "diy", "selfie",
    "income_level", "ownership", "season", "persona", "strike_low", "strike_high",
}
INSIGHT_TAG_FIELDS = {
    "comparison_type", "direction", "data_source", "season", "tou_period",
    "generic_insight", "generic_insight_type", "challenge_status", "min_value", "max_value",
}

ADMIN_ONLY_ACTIONS = {
    "merge", "unmerge", "export", "delete_pilot", "delete_action", "delete_insight",
    "create_pilot", "clone_pilot", "upload_sheet", "manage_users",
}

# Three roles (2026-07-03): admin (Delivery, full access), tpm_csm (CSM/TPM,
# content-edit access — this is what used to be called "user"), utility
# (external, read-only, scoped per-account to specific pilots/content/channel).


def action_editable_fields(role: str) -> set:
    # "status" is deliberately excluded here (2026-07-06) — it now moves only
    # through the dedicated submit/unlock/publish endpoints in main.py, which
    # enforce the Draft/Ready-for-QA/Published/Modified transition rules.
    # Allowing it through the generic PATCH would let Admin skip those rules.
    perms = rbac.resolve_permissions(rbac.ACTION_FIELD_MATRIX, role)
    return {f for f, p in perms.items() if p == rbac.Permission.EDIT}


def insight_editable_fields(role: str) -> set:
    perms = rbac.resolve_permissions(rbac.INSIGHT_FIELD_MATRIX, role)
    return {f for f, p in perms.items() if p == rbac.Permission.EDIT}


def utility_visible_action_fields(channel_scope: str) -> set:
    """What a scoped Utility account may VIEW on an action, given their
    account's channel_scope (email | paper | both)."""
    perms = rbac.resolve_permissions(rbac.ACTION_FIELD_MATRIX, "utility", channel_scope)
    return {f for f, p in perms.items() if p != rbac.Permission.NONE} | rbac.ACTION_ALWAYS_INCLUDED - {"pilot_id"}


def utility_visible_insight_fields(channel_scope: str) -> set:
    """Mirrors utility_visible_action_fields."""
    perms = rbac.resolve_permissions(rbac.INSIGHT_FIELD_MATRIX, "utility", channel_scope)
    return {f for f, p in perms.items() if p != rbac.Permission.NONE} | rbac.INSIGHT_ALWAYS_INCLUDED - {"pilot_id"}


def resolve_action_permissions(role: str, channel_scope: str | None = None) -> dict:
    """Returns {field: "edit"|"view"|"none"} for every ActionItem field, for
    the given role (+ channel_scope for utility accounts). Used to build a
    role-filtered response for every role, not just utility — see main.py."""
    return rbac.resolve_permissions(rbac.ACTION_FIELD_MATRIX, role, channel_scope)


def resolve_insight_permissions(role: str, channel_scope: str | None = None) -> dict:
    """Mirrors resolve_action_permissions."""
    return rbac.resolve_permissions(rbac.INSIGHT_FIELD_MATRIX, role, channel_scope)


def filter_response(obj, permissions_map: dict, always_included: set) -> dict:
    """Builds a role-filtered response dict from an ORM object: every field in
    permissions_map with permission != "none", plus the always-included
    structural fields (id, pilot_id, action_id/insight_id, status, merged)."""
    result = {f: getattr(obj, f) for f, p in permissions_map.items() if p != rbac.Permission.NONE}
    result.update({f: getattr(obj, f) for f in always_included})
    return result
