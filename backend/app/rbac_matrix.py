"""
Single source of truth for field-level RBAC on ActionItem/InsightItem
(2026-07-08). Replaces four independently-maintained places that used to
define this by hand with no enforced consistency between them: permissions.py's
field sets, main.py's per-endpoint checks, frontend/src/fieldGroups.ts's
hand-mirrored TS constants, and inline field-name arrays in
ActionEditor.tsx/InsightEditor.tsx.

For every field: a category (documentation/grouping only) and a permission
level per role. Kept as a plain Python module, not a DB table, on purpose —
Kaushik will hand-refine the exact matrix over time, and a change here is a
reviewable git diff, not a runtime edit with no audit trail.

Default rule-of-thumb by category:
  content  — admin edit, tpm_csm edit, utility view (channel-gated)
  image    — admin edit, tpm_csm edit, utility view (channel-gated where the
             field is channel-specific; icon_url is channel-agnostic)
  internal — admin edit, tpm_csm view (not edit), utility none
  generated— edit blocked for EVERY role (tag_string is regenerated
             server-side from the structured tag fields, never hand-edited);
             view: admin yes, tpm_csm yes, utility no

Exception: `appliance` is classified internal/identity but stays utility=view
on both entities — it's the one identity field a utility contact needs as
context to know which appliance/content they're reviewing. This matches
existing behavior (no regression); every other internal field is utility=none.

Two real behavior changes vs. the pre-matrix implementation, both direct
consequences of applying Kaushik's stated category rules uniformly rather
than leaving legacy exceptions in place:
  1. Images become utility-visible (channel-gated). Previously Actions showed
     utility zero images ever, and Insights showed icon_url unconditionally
     regardless of channel_scope.
  2. subject_title_paper/cta_text/cta_link_name (Actions) become
     utility-visible like every other content field. Previously these three
     were TPM/Admin-editable "content" fields that were nonetheless withheld
     from utility_visible_action_fields, with no documented reason found for
     the inconsistency during the audit.

`status` and `merged` are NOT in this matrix — they're always view-for-every-
role and live outside the edit allowlist entirely (status changes only via
the dedicated submit/unlock/publish endpoints in main.py, not the generic
PATCH this matrix governs).

Each rule also carries a human-readable `description` (2026-07-15), the
backing data for the admin-only "Schema" reference page (see
backend/app/schema_reference.py) — plain-English meaning, accepted-value
notes, and any known data-quality quirks worth a reader knowing about. Written
per matrix entry, not deduped by field name, since several field names
(season, appliance, fuel_type, tag_string, updated_at, extra_tags, icon_url)
mean different things or carry different vocab between the two entities.
"""
from __future__ import annotations

from dataclasses import dataclass


class Permission:
    EDIT = "edit"
    VIEW = "view"
    NONE = "none"


class Category:
    CONTENT = "content"
    IMAGE = "image"
    INTERNAL = "internal"
    GENERATED = "generated"


@dataclass(frozen=True)
class FieldRule:
    field: str
    category: str
    admin: str
    tpm_csm: str
    utility: str
    channel: str | None = None  # "email" | "paper" | None (channel-agnostic — always shown regardless of channel_scope)
    description: str = ""


ACTION_FIELD_MATRIX: list[FieldRule] = [
    # --- content: admin/tpm_csm edit, utility view (channel-gated) ---
    FieldRule("description", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="email",
              description="Main email body copy for this action — the primary explanatory text shown in the Email/Web channel."),
    FieldRule("subject_line_email", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="email",
              description="Email subject line for this action."),
    FieldRule("footer_disclaimer", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="email",
              description="Legal/disclaimer text shown in the email footer (e.g. \"All percentages are rounded to the nearest percent.\")."),
    FieldRule("short_desc", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="paper",
              description="Short paper-channel description. Max 110 chars, required before this action can move to Ready for QA."),
    FieldRule("title", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="paper",
              description="Paper-channel headline/title. Max 55 chars, required before Ready for QA."),
    FieldRule("subject_title_paper", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.VIEW, channel="paper",
              description="Paper-channel subject/title line, distinct from the shorter `title` field."),
    FieldRule("cta_text", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.VIEW,
              description="Call-to-action button/link text (e.g. \"VIEW EFFICIENT PRODUCTS\"), shown regardless of channel."),
    FieldRule("cta_link_name", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.VIEW,
              description="Human-readable label for the CTA's destination link (e.g. \"Smart Power Strip Marketplace Page\")."),

    # --- image: admin/tpm_csm edit, utility view (channel-gated) ---
    FieldRule("icon_url", Category.IMAGE, Permission.EDIT, Permission.EDIT, Permission.VIEW,
              description="Icon image URL, channel-agnostic — the same icon shown in both Email and Paper."),
    FieldRule("image_paper_url", Category.IMAGE, Permission.EDIT, Permission.EDIT, Permission.VIEW, channel="paper",
              description="Paper-channel hero image URL (425x550px per the source sheet's spec)."),
    FieldRule("image_email_url", Category.IMAGE, Permission.EDIT, Permission.EDIT, Permission.VIEW, channel="email",
              description="Email-channel hero image URL (1200x520px per the source sheet's spec)."),

    # --- internal: admin edit, tpm_csm view-only, utility none ---
    FieldRule("nbi_family", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Top-level NBI grouping (e.g. \"EE\" for energy efficiency). No enum enforced in code — source data has been seen with inconsistent casing (\"EE\" vs \"ee\"). Required before Ready for QA."),
    FieldRule("nbi_type", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Sub-classification of the NBI within its family (e.g. \"Program\", \"Actionable Reco tip\"). No enum enforced in code. Required before Ready for QA."),
    FieldRule("fuel_type", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which utility fuel this action targets. No enum enforced in code; observed values are ELECTRIC/GAS. Required before Ready for QA, and checked against the paired Insight's fuel_type at merge time (must match)."),
    FieldRule("appliance", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.VIEW,  # exception — utility context field
              description="Which appliance this action targets — one of 14 fixed codes (see sheet_export.py's ACTION_APPLIANCE_FLAGS), e.g. \"ac\" cooling, \"wh\" water heater. Required before Ready for QA, checked against the paired Insight's appliance at merge time. The one internal field Utility accounts can view, for context on what they're reviewing."),
    FieldRule("channels", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which channel(s) this action is eligible for, e.g. \"email | paper\". No enum enforced in code."),
    FieldRule("cta_link", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="The CTA's actual destination URL."),
    FieldRule("utility_objectives", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Free-text notes on which utility program objectives this action serves. \"High blast radius if wrong\" per the original schema notes — affects which pilots/campaigns pull this action in."),
    FieldRule("filter_ownership", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Filters this action to owner/renter households. No enum enforced in code (only \"owner\" observed so far); likely intended to align with the `ownership` tag vocab below but stored as a single free-text field, not validated against it."),
    FieldRule("filter_season", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Filters this action to a season. No enum enforced in code (only \"summer\"/\"winter\" observed so far); likely intended to align with the `season` tag vocab below but stored as a single free-text string, not the 6-value list vocab."),
    FieldRule("reco_type", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="The fundamental kind of recommendation this is: edu (Educational), prod (Product), prog (Program), or tip (Tip). Single-valued, feeds tag_string."),
    FieldRule("benefit_scale", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Coarse bucket for expected household energy savings: b_no (None), b_low (<50 kWh/mo), b_med (50-180 kWh/mo), b_high (>200 kWh/mo). Single-valued."),
    FieldRule("cost_scale", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Coarse bucket for the cost to the household of taking this action: c_no, c_low, c_med, c_high. Single-valued."),
    FieldRule("effort_scale", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Coarse bucket for the effort required to take this action: e_no, e_low, e_med, e_high. Single-valued."),
    FieldRule("diy", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Whether this is a do-it-yourself action, as opposed to one requiring a professional or purchase."),
    FieldRule("selfie", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Whether this action requires the user to submit a photo/selfie as proof of completion."),
    FieldRule("income_level", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which household income brackets this action targets — any subset of inc_low, inc_med, inc_high."),
    FieldRule("ownership", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which household ownership types this action targets — any subset of owner, renter."),
    FieldRule("season", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which seasonal periods this action targets — any subset of the 6-value pre/peak/post summer/winter vocab (pre_summer, peak_summer, post_summer, pre_winter, peak_winter, post_winter)."),
    FieldRule("persona", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which behavioral personas this action targets — any subset of tou (Time-of-Use), green (Green/Eco)."),
    FieldRule("strike_low", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Lower bound of a usage-threshold range that must be crossed for this action to be relevant. Paired with strike_high — both must be set together to appear in tag_string as strike_{low}_{high}."),
    FieldRule("strike_high", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Upper bound of the usage-threshold range paired with strike_low."),
    FieldRule("extra_tags", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Free-text escape hatch for any tag_string token that doesn't match one of the structured vocabularies above — preserves data from the original sheet's long-tail columns that this tool doesn't model as first-class fields."),

    # --- generated: edit blocked for everyone, view for internal roles only ---
    FieldRule("tag_string", Category.GENERATED, Permission.VIEW, Permission.VIEW, Permission.NONE,
              description="Legacy pipe-delimited tag string (e.g. \"tip | b_med | c_no | e_low | pre_summer | peak_summer | ac\") read by the NBI engine downstream. Regenerated automatically from the structured tag fields above on every save — never hand-edited, edit blocked for every role."),
    FieldRule("updated_at", Category.GENERATED, Permission.VIEW, Permission.VIEW, Permission.NONE,  # system-managed timestamp, not user-edited
              description="Timestamp of the last edit. System-managed, not user-editable by any role."),
]

INSIGHT_FIELD_MATRIX: list[FieldRule] = [
    # --- content ---
    FieldRule("subject_line", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="email",
              description="Email subject line for this insight."),
    FieldRule("insight_text", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="email",
              description="Main email body copy for this insight."),
    FieldRule("insight_semantic", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="paper",
              description="Paper-channel body copy. Max 135 chars, required before this insight can move to Ready for QA."),
    FieldRule("paper_text", Category.CONTENT, Permission.EDIT, Permission.EDIT, Permission.EDIT, channel="paper",
              description="Additional paper-channel body copy, distinct from insight_semantic."),

    # --- image ---
    FieldRule("icon_url", Category.IMAGE, Permission.EDIT, Permission.EDIT, Permission.VIEW,
              description="Icon image URL, channel-agnostic. Previewed in the editor but the source sheet has no dimension spec for it, unlike Actions' two sized image fields."),

    # --- internal ---
    FieldRule("fuel_type", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which utility fuel this insight targets. No enum enforced in code; observed values are ELECTRIC/GAS. Required before Ready for QA, checked against the paired Action's fuel_type at merge time."),
    FieldRule("channel", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which channel(s) this insight is eligible for, e.g. \"email | paper\". No enum enforced in code. Required before Ready for QA."),
    FieldRule("variable_name", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which kind of value the insight's template variable substitutes (e.g. the {Value} placeholder in insight_text). No enum enforced in code, but real pilot data is 100% clean across exactly 3 values: percentage, dollar, percentile. Every single \"dollar\" insight has min_value/max_value set; zero percentage/percentile insights do — min_value/max_value are semantically meaningless except when variable_name=\"dollar\", though nothing currently enforces that pairing (found 2026-07-15, not yet validated broadly enough to lock down as a server-side enum)."),
    FieldRule("appliance", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.VIEW,  # exception, see ActionItem note above
              description="Which appliance this insight targets — one of 15 fixed codes (see sheet_export.py's INSIGHT_APPLIANCE_FLAGS), e.g. \"ac\" cooling, \"wh\" water heater. Required before Ready for QA, checked against the paired Action's appliance at merge time. Note: this entity's Lighting code is \"lt\", where Actions uses \"li\" for the same appliance — both are correct, an intentional quirk of the original master sheet, not a data error. The one internal field Utility accounts can view, for context."),
    FieldRule("comparison_type", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="What kind of comparison this insight draws: peer (Peer), self (Self), rate (Rate), or behav (Behavioral). Single-valued."),
    FieldRule("direction", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Whether the comparison is favorable or not: neg (Negative), neu (Neutral), pos (Positive). Single-valued."),
    FieldRule("data_source", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which underlying data this insight is computed from: bill_amt (Bill Amount), high_usage (High Usage Event), pk_consumption (Peak Hour Consumption). Single-valued."),
    FieldRule("season", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which season this insight applies to — summer and/or winter only. Note: Insights use a 2-value season vocab, distinct from Actions' 6-value pre/peak/post summer/winter breakdown."),
    FieldRule("tou_period", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which time-of-use period(s) this insight applies to — any subset of tou_peak, tou_midpeak, tou_offpeak, tou_all. Note: this column's own inline comment in models.py (\"subset of [peak, mid_peak, off_peak, all]\") is stale — it's missing the tou_ prefix the real accepted values all carry."),
    FieldRule("generic_insight", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Whether this is a generic insight (applicable to users with little or no usage data yet), as opposed to a personalized, data-driven one."),
    FieldRule("generic_insight_type", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Which kind of generic insight this is: gen_welcome, gen_edu_tip, gen_feature, gen_seasonal, gen_feel_good, or gen_green. Only meaningful when generic_insight is true. Note: this column's own inline comment in models.py is stale — it's missing the gen_ prefix the real accepted values all carry."),
    FieldRule("challenge_status", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Whether the user is doing better or worse than target on an active challenge: chlg_bad (Doing Worse Than Target) or chlg_good (Doing Better Than Target). Note: this column's own inline comment in models.py (\"bad | good\") is stale — missing the chlg_ prefix the real accepted values carry."),
    FieldRule("min_value", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Lower bound of a dollar range this insight discusses (e.g. a potential savings range). Plain integer, no vocab. Only meaningful when variable_name=\"dollar\" — see that field's note."),
    FieldRule("max_value", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Upper bound of the dollar range paired with min_value."),
    FieldRule("extra_tags", Category.INTERNAL, Permission.EDIT, Permission.VIEW, Permission.NONE,
              description="Free-text escape hatch for any tag_string token that doesn't match a structured vocabulary above — this is where the sheet's long, unmodeled tail (per-month/weekday flags, event-date markers, gas-user segment, comparison-recurrence counters, etc.) currently lives."),

    # --- generated ---
    FieldRule("tag_string", Category.GENERATED, Permission.VIEW, Permission.VIEW, Permission.NONE,
              description="Legacy pipe-delimited tag string read by the NBI engine downstream. Regenerated automatically from the structured tag fields above on every save, as bare min/max integers matching the source sheet's own convention — never hand-edited."),
    FieldRule("updated_at", Category.GENERATED, Permission.VIEW, Permission.VIEW, Permission.NONE,  # system-managed timestamp, not user-edited
              description="Timestamp of the last edit. System-managed, not user-editable by any role."),
]

assert all(r.description for r in ACTION_FIELD_MATRIX + INSIGHT_FIELD_MATRIX), \
    "every FieldRule needs a description — see backend/app/schema_reference.py, which surfaces this text on the admin Schema page"

# Structural fields — always present in every response for every role, never
# role-gated (needed just to identify/display the row; status/merged have
# their own lifecycle/computed semantics, not a matrix entry).
ACTION_ALWAYS_INCLUDED = {"id", "pilot_id", "action_id", "status", "merged"}
INSIGHT_ALWAYS_INCLUDED = {"id", "pilot_id", "insight_id", "status", "merged"}


def resolve_permissions(matrix: list[FieldRule], role: str, channel_scope: str | None = None) -> dict[str, str]:
    """Returns {field: "edit"|"view"|"none"} for every field in the matrix,
    given a role and (for utility accounts) their channel_scope. Non-utility
    callers should pass channel_scope=None — channel-gating only ever applies
    to utility, since content_scope/channel_scope are meaningless for admin/tpm_csm
    (see models.py User comment)."""
    result = {}
    for rule in matrix:
        perm = getattr(rule, role)
        if role == "utility" and perm != Permission.NONE and rule.channel is not None:
            if channel_scope not in (rule.channel, "both"):
                perm = Permission.NONE
        result[rule.field] = perm
    return result
