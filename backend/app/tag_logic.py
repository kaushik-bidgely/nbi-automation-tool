"""
Structured tag vocabulary + conversion to/from the legacy pipe-delimited
tag_string ("tip | b_med | c_no | e_low | pre_summer | peak_summer | ac").

Why this exists: the master sheet's tag_string is the actual source of truth
read by the NBI engine, but authoring it as free text is exactly how the
Actions Master analysis found records drift out of sync (a binary flag column
edited without updating the string). Structured fields make that class of
error impossible — tag_string is now GENERATED from the structured fields,
never hand-edited.

Vocabulary order matches the master sheet's own column order (row 4 tag names
in `Actions and Insights (Kaushik).xlsx`), so a generated tag_string round-trips
byte-for-byte with the original sheet format.
"""
from __future__ import annotations

RECO_TYPES = {"edu": "Educational", "prod": "Product", "prog": "Program", "tip": "Tip"}
BENEFIT_SCALE = {"b_no": "None", "b_low": "Low (<50 kWh/mo)", "b_med": "Medium (50-180 kWh/mo)", "b_high": "High (>200 kWh/mo)"}
COST_SCALE = {"c_no": "None", "c_low": "Low", "c_med": "Medium", "c_high": "High"}
EFFORT_SCALE = {"e_no": "None", "e_low": "Low", "e_med": "Medium", "e_high": "High"}
INCOME_LEVELS = {"inc_low": "Low income", "inc_med": "Medium income", "inc_high": "High income"}
OWNERSHIP = {"owner": "Owner", "renter": "Renter"}
SEASONS = {
    "pre_summer": "Pre-Summer", "peak_summer": "Peak Summer", "post_summer": "Post-Summer",
    "pre_winter": "Pre-Winter", "peak_winter": "Peak Winter", "post_winter": "Post-Winter",
}
PERSONAS = {"tou": "Time-of-Use", "green": "Green/Eco"}

# Canonical field order for building the string — mirrors the sheet's own column order.
_SINGLE_FIELDS = ["reco_type", "benefit_scale", "cost_scale", "effort_scale"]
_BOOL_FIELDS = {"diy": "diy", "selfie": "selfie"}
_LIST_FIELDS = ["income_level", "ownership", "season", "persona"]

_ALL_VOCAB = {**RECO_TYPES, **BENEFIT_SCALE, **COST_SCALE, **EFFORT_SCALE,
              **INCOME_LEVELS, **OWNERSHIP, **SEASONS, **PERSONAS, "diy": "DIY", "selfie": "Selfie"}


import re

_STRIKE_RE = re.compile(r"strike_(\d+)_(\d+)")


def parse_tag_string(tag_string: str | None, appliance: str | None = None) -> dict:
    """Decodes a legacy pipe-delimited tag string into structured fields.
    Used only when importing existing sheet data — never called on save.
    Tokens that aren't recognized vocabulary and aren't the row's own
    appliance code or a strike_l_h marker are preserved in `leftover` so
    genuinely custom tags aren't silently dropped."""
    tokens = [t.strip() for t in (tag_string or "").split("|") if t.strip()]
    result = {"reco_type": None, "benefit_scale": None, "cost_scale": None, "effort_scale": None,
              "diy": False, "selfie": False, "income_level": [], "ownership": [], "season": [],
              "persona": [], "strike_low": None, "strike_high": None, "leftover": []}
    for t in tokens:
        strike_match = _STRIKE_RE.fullmatch(t)
        if t in RECO_TYPES:
            result["reco_type"] = t
        elif t in BENEFIT_SCALE:
            result["benefit_scale"] = t
        elif t in COST_SCALE:
            result["cost_scale"] = t
        elif t in EFFORT_SCALE:
            result["effort_scale"] = t
        elif t == "diy":
            result["diy"] = True
        elif t == "selfie":
            result["selfie"] = True
        elif t in INCOME_LEVELS:
            result["income_level"].append(t)
        elif t in OWNERSHIP:
            result["ownership"].append(t)
        elif t in SEASONS:
            result["season"].append(t)
        elif t in PERSONAS:
            result["persona"].append(t)
        elif strike_match:
            result["strike_low"], result["strike_high"] = int(strike_match[1]), int(strike_match[2])
        elif appliance and t == appliance:
            pass  # appliance is stored on its own column already
        else:
            result["leftover"].append(t)
    return result


def build_tag_string(item) -> str:
    """Regenerates the tag_string from an ActionItem's structured fields.
    Called on every save so tag_string is always in sync — that's the whole
    point of structuring these fields instead of free-texting them."""
    parts = []
    if item.reco_type:
        parts.append(item.reco_type)
    if item.diy:
        parts.append("diy")
    if item.benefit_scale:
        parts.append(item.benefit_scale)
    if item.cost_scale:
        parts.append(item.cost_scale)
    if item.selfie:
        parts.append("selfie")
    if item.effort_scale:
        parts.append(item.effort_scale)
    for field_name in ("income_level", "ownership", "season", "persona"):
        parts.extend(getattr(item, field_name) or [])
    if item.appliance:
        parts.append(item.appliance)
    if item.strike_low is not None and item.strike_high is not None:
        parts.append(f"strike_{item.strike_low}_{item.strike_high}")
    return " | ".join(parts)


def label_for(tag: str) -> str:
    return _ALL_VOCAB.get(tag, tag)


# ---------- Insights ----------
# Scoped to the core, commonly-used categories from the sheet's 102-column tag
# vocabulary (comparison_type, direction, data_source, season, tou_period,
# generic-insight type, challenge_status, min/max). The long tail — per-month
# and per-weekday flags, event-date markers, gas-user-segment, aggregation
# type — stays in extra_tags as free text, the same escape hatch Actions uses
# for its own long tail. Not a full 1:1 replication of every column; a
# deliberate proportionality call.

COMPARISON_TYPES = {"peer": "Peer", "self": "Self", "rate": "Rate", "behav": "Behavioral"}
DIRECTIONS = {"neg": "Negative", "neu": "Neutral", "pos": "Positive"}
DATA_SOURCES = {"bill_amt": "Bill Amount", "high_usage": "High Usage Event", "pk_consumption": "Peak Hour Consumption"}
INSIGHT_SEASONS = {"summer": "Summer", "winter": "Winter"}
TOU_PERIODS = {"tou_peak": "Peak", "tou_midpeak": "Mid Peak", "tou_offpeak": "Off Peak", "tou_all": "All Hours"}
GENERIC_INSIGHT_TYPES = {
    "gen_welcome": "Welcome", "gen_edu_tip": "Educational Tip", "gen_feature": "Feature",
    "gen_seasonal": "Seasonal", "gen_feel_good": "Feel Good", "gen_green": "Green",
}
CHALLENGE_STATUSES = {"chlg_bad": "Doing Worse Than Target", "chlg_good": "Doing Better Than Target"}

_INSIGHT_VOCAB = {**COMPARISON_TYPES, **DIRECTIONS, **DATA_SOURCES, **INSIGHT_SEASONS, **TOU_PERIODS,
                   **GENERIC_INSIGHT_TYPES, **CHALLENGE_STATUSES, "generic": "Generic"}

_BARE_INT_RE = re.compile(r"\d+")


def parse_insight_tag_string(tag_string: str | None, appliance: str | None = None) -> dict:
    """Mirrors parse_tag_string — decodes a legacy Insight tag string into
    structured fields. Import-time only, never called on save."""
    tokens = [t.strip() for t in (tag_string or "").split("|") if t.strip()]
    result = {"comparison_type": None, "direction": None, "data_source": None, "season": [],
              "tou_period": [], "generic_insight": False, "generic_insight_type": None,
              "challenge_status": None, "min_value": None, "max_value": None, "leftover": []}
    for t in tokens:
        if t in COMPARISON_TYPES:
            result["comparison_type"] = t
        elif t in DIRECTIONS:
            result["direction"] = t
        elif t in DATA_SOURCES:
            result["data_source"] = t
        elif t in INSIGHT_SEASONS:
            result["season"].append(t)
        elif t in TOU_PERIODS:
            result["tou_period"].append(t)
        elif t == "generic":
            result["generic_insight"] = True
        elif t in GENERIC_INSIGHT_TYPES:
            result["generic_insight_type"] = t
        elif t in CHALLENGE_STATUSES:
            result["challenge_status"] = t
        elif _BARE_INT_RE.fullmatch(t):
            # The source sheet encodes the $ min/max range as two bare
            # integers with no "min_"/"max_" prefix — verified against every
            # row in the real file that has a value here: always exactly 2
            # bare-int tokens, always min then max. (The prefixed form this
            # used to look for never actually appears in real data, so
            # min_value/max_value silently stayed None for every insight that
            # had one — caught via a round-trip diff against the source file,
            # 2026-07-15.)
            if result["min_value"] is None:
                result["min_value"] = int(t)
            elif result["max_value"] is None:
                result["max_value"] = int(t)
            else:
                result["leftover"].append(t)
        elif appliance and t == appliance:
            pass
        else:
            result["leftover"].append(t)
    return result


def build_insight_tag_string(item) -> str:
    """Regenerates an InsightItem's tag_string from its structured fields —
    same rationale as build_tag_string for Actions."""
    parts = []
    if item.comparison_type:
        parts.append(item.comparison_type)
    if item.direction:
        parts.append(item.direction)
    if item.data_source:
        parts.append(item.data_source)
    parts.extend(item.season or [])
    parts.extend(item.tou_period or [])
    if item.generic_insight:
        parts.append("generic")
    if item.generic_insight_type:
        parts.append(item.generic_insight_type)
    if item.challenge_status:
        parts.append(item.challenge_status)
    # Bare integers, not "min_X"/"max_X" — matches the source sheet's own
    # convention (see parse_insight_tag_string) so a regenerated tag_string
    # round-trips in the same format as the original, not a new one.
    if item.min_value is not None:
        parts.append(str(item.min_value))
    if item.max_value is not None:
        parts.append(str(item.max_value))
    if item.appliance:
        parts.append(item.appliance)
    return " | ".join(parts)


def insight_label_for(tag: str) -> str:
    return _INSIGHT_VOCAB.get(tag, tag)
