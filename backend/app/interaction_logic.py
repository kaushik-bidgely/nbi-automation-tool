"""Ports the Action+Insight pairing logic from PE's generate_nbi_configs.py
(bidgely/pingpong, dev-tools/src/main/python/) so bulk-merge in this app
produces the same pairs and the same 20-column NBI config schema the real
script does — ported deliberately 1:1, including its currently-inactive
(commented-out) rule branches, rather than "improved" independently.
"""

from __future__ import annotations

from dataclasses import dataclass

# add_seasonal_actions(): ac/sh-appliance actions of these two nbi_types get a
# synthetic seasonal counterpart generated before pairing. Represented here as
# a second InteractionRecord (seasonal_suffix set) referencing the same real
# ActionItem, rather than a second synthetic ActionItem row.
_SEASON_BY_APPLIANCE = {"ac": "Summer", "sh": "Winter"}
_SUFFIX_BY_APPLIANCE = {"ac": "S", "sh": "W"}
_SEASONAL_NBI_TYPE_TEMPLATE = {
    "Actionable Reco tip": "{season}Seasonal",
    "Program": "{season}Program",
}

FIELDS = [
    "nbi_id", "insight_id", "action_id", "insight_semantic", "insight_text", "action",
    "tag_insight", "tag_action", "tag_generic", "tag_objective", "var_i_name",
    "filter_utility", "filter_ownership", "filter_season", "nbi_family", "nbi_type",
    "nbi_fuel_type", "nbi_appliance", "min", "max",
]


def seasonal_variant_for(action) -> tuple[str, str] | None:
    """Mirrors add_seasonal_actions(): returns (suffix, nbi_type) for this
    action's synthetic seasonal counterpart, or None if it doesn't qualify."""
    season = _SEASON_BY_APPLIANCE.get(action.appliance)
    template = _SEASONAL_NBI_TYPE_TEMPLATE.get((action.nbi_type or "").strip())
    if not season or not template:
        return None
    return _SUFFIX_BY_APPLIANCE[action.appliance], template.format(season=season)


@dataclass
class _EffectiveAction:
    """The action as apply_rules() sees it — for a seasonal variant, action_id
    and nbi_type are swapped (matching add_seasonal_actions' row.copy()),
    every other field is identical to the source ActionItem."""
    action_id: str
    nbi_type: str | None
    appliance: str | None
    fuel_type: str | None
    tag_string: str | None
    extra_tags: str | None
    utility_objectives: str | None
    filter_ownership: str | None
    filter_season: str | None
    nbi_family: str | None
    description: str | None


def effective_action(action, seasonal_suffix: str | None) -> _EffectiveAction:
    nbi_type = action.nbi_type
    action_id = action.action_id
    if seasonal_suffix:
        variant = seasonal_variant_for(action)
        if not variant or variant[0] != seasonal_suffix:
            raise ValueError(f"Action {action.action_id!r} has no {seasonal_suffix!r} seasonal variant")
        action_id = f"{action.action_id}_{seasonal_suffix}"
        nbi_type = variant[1]
    return _EffectiveAction(
        action_id=action_id, nbi_type=nbi_type, appliance=action.appliance, fuel_type=action.fuel_type,
        tag_string=action.tag_string, extra_tags=action.extra_tags, utility_objectives=action.utility_objectives,
        filter_ownership=action.filter_ownership, filter_season=action.filter_season,
        nbi_family=action.nbi_family, description=action.description,
    )


def _is_blank(value) -> bool:
    return value is None or str(value).strip() == "" or str(value).strip().lower() == "nan"


def _split_pipe(value) -> list[str]:
    return [] if _is_blank(value) else [t.strip() for t in str(value).split("|")]


def get_all_extra_tags(raw_values) -> list[str]:
    """Pools every row's extra_tags into one flat list — mirrors
    get_all_extra_tags() in generate_nbi_configs.py, which is computed once
    across the whole master sheet before the pairing loop, not per-pair."""
    tags: list[str] = []
    for value in raw_values:
        tags.extend(_split_pipe(value))
    return tags


def _is_nbi_valid_based_on_extra_tags(insight, eff_action, insight_tags_extra_pool, action_tags_extra_pool):
    """Returns (valid, extra_tags_matched) — ported from
    is_nbi_valid_based_on_extra_tags(), quirk-for-quirk: the final same-tag
    check compares the insight's whole (unsplit) extra_tags string against
    the action's split tag list, exactly as the source script does."""
    insight_extra, action_extra = insight.extra_tags, eff_action.extra_tags

    if _is_blank(insight_extra) and _is_blank(action_extra):
        return True, False

    if not _is_blank(insight_extra):
        for tag in _split_pipe(insight_extra):
            if tag not in action_tags_extra_pool:
                return True, False

    if not _is_blank(action_extra):
        for tag in _split_pipe(action_extra):
            if tag not in insight_tags_extra_pool:
                return True, False

    if insight_extra in _split_pipe(action_extra):
        return True, True

    return False, False


def apply_rules(insight, eff_action, insight_tags_extra_pool, action_tags_extra_pool) -> bool:
    """Ported 1:1 from apply_rules() in generate_nbi_configs.py."""
    if insight.fuel_type != eff_action.fuel_type:
        return False
    if insight.appliance != eff_action.appliance:
        return False

    valid, extra_tags_matched = _is_nbi_valid_based_on_extra_tags(
        insight, eff_action, insight_tags_extra_pool, action_tags_extra_pool,
    )
    if not valid:
        return False
    if extra_tags_matched:
        return True

    insight_tags = _split_pipe(insight.tag_string)
    action_tags = _split_pipe(eff_action.tag_string)

    if "tou" in str(insight.tag_string or "") and "tou" not in str(eff_action.tag_string or ""):
        return False
    if "tou" in str(eff_action.tag_string or "") and "tou" not in str(insight.tag_string or ""):
        return False

    if eff_action.nbi_type in ("Program", "SummerProgram", "WinterProgram"):
        if insight.variable_name != "dollar":
            return False
        # source script only excludes 1_bc here (2_bc..5_bc branches exist but
        # are commented out upstream) — kept inactive to match it exactly.
        if ("c_high" in action_tags or "c_med" in action_tags) and "1_bc" in insight_tags:
            return False

    if "prod" in action_tags and "generic" in insight_tags:
        return False

    return True


def generate_candidates(actions, insights) -> list[tuple[object, object, str | None]]:
    """Mirrors create_dynamic_sheet_and_scripts()'s double loop: every action
    is tried both as itself and (if eligible) as its seasonal variant, against
    every insight. Returns (action, insight, seasonal_suffix) triples for
    pairs that pass apply_rules."""
    action_extra_pool = get_all_extra_tags(a.extra_tags for a in actions)
    insight_extra_pool = get_all_extra_tags(i.extra_tags for i in insights)

    candidates = []
    for action in actions:
        suffixes: list[str | None] = [None]
        variant = seasonal_variant_for(action)
        if variant:
            suffixes.append(variant[0])
        for suffix in suffixes:
            eff = effective_action(action, suffix)
            for insight in insights:
                if apply_rules(insight, eff, insight_extra_pool, action_extra_pool):
                    candidates.append((action, insight, suffix))
    return candidates


def compute_fields(interaction) -> dict:
    """The 20 PE-config-schema fields for one InteractionRecord, applying its
    per-interaction overrides and seasonal-variant identity where set."""
    action, insight = interaction.action_item, interaction.insight_item
    eff = effective_action(action, interaction.seasonal_suffix)
    shared_appliance = insight.appliance if insight.appliance == eff.appliance else ""

    return {
        "nbi_id": f"{insight.insight_id}_{eff.action_id}",
        "insight_id": insight.insight_id,
        "action_id": eff.action_id,
        "insight_semantic": interaction.insight_semantic_override
        if interaction.insight_semantic_override is not None else insight.insight_semantic,
        "insight_text": interaction.insight_text_override
        if interaction.insight_text_override is not None else insight.insight_text,
        "action": interaction.action_text_override
        if interaction.action_text_override is not None else eff.description,
        "tag_insight": insight.tag_string,
        "tag_action": eff.tag_string,
        "tag_generic": shared_appliance,
        "tag_objective": eff.utility_objectives,
        "var_i_name": insight.variable_name,
        "filter_utility": "",  # generate_nbi_configs.py hardcodes this blank — never derived from source data
        "filter_ownership": eff.filter_ownership,
        "filter_season": eff.filter_season,
        "nbi_family": eff.nbi_family,
        "nbi_type": eff.nbi_type,
        "nbi_fuel_type": eff.fuel_type,
        "nbi_appliance": shared_appliance,
        "min": insight.min_value,
        "max": insight.max_value,
        "seasonal_suffix": interaction.seasonal_suffix,
    }
