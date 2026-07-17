"""
Shared column-mapping logic for importing the master Actions/Insights sheet
format into a pilot. Used by both the CLI seed script (app/seed.py) and the
Admin "upload sheet for this pilot" API endpoint, so there's one source of
truth for the column positions instead of two copies drifting apart.

Column positions match the analysis in
`Personal/PM Functional Review/Design/DETO/CMS - Insights/Old NBI Automation Tool.md`.

Upserts by (pilot_id, action_id)/(pilot_id, insight_id) instead of blindly
inserting — re-uploading a corrected sheet is a realistic workflow and
shouldn't crash on the unique constraint or create duplicates.
"""
import pandas as pd

from . import models
from .tag_logic import parse_tag_string, build_tag_string, parse_insight_tag_string, build_insight_tag_string

ACTIONS_HEADER_ROW = 5
INSIGHTS_HEADER_ROW = 4


def _first(*vals):
    for v in vals:
        if pd.notna(v) and str(v).strip():
            return str(v).strip()
    return None


def _id_str(v) -> str:
    """str(v) alone turns a numeric-looking ID column that pandas inferred as
    float (e.g. all-digit action/insight IDs) into "123.0" instead of "123",
    which would silently break the (pilot_id, action_id) upsert match on
    re-upload and create a duplicate rather than updating the existing row."""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def import_actions(db, path_or_buffer, pilot_id: int) -> dict:
    df = pd.read_excel(path_or_buffer, sheet_name="Actions", header=ACTIONS_HEADER_ROW)
    imported = 0
    skipped_published = 0
    for _, row in df.iterrows():
        if pd.isna(row.iloc[0]):
            continue
        action_id = _id_str(row.iloc[0])

        item = db.query(models.ActionItem).filter_by(pilot_id=pilot_id, action_id=action_id).first()
        if item and item.status == "published":
            # Mirrors the generic PATCH endpoint's rule: a Published item must
            # be explicitly Unlocked before its content changes. A sheet
            # upload is a bulk field overwrite just like PATCH, so it must not
            # silently rewrite a live published item's content out from under
            # that lifecycle guarantee.
            skipped_published += 1
            continue

        appliance = _first(row.iloc[4])
        raw_tag_string = _first(row.iloc[25])
        parsed = parse_tag_string(raw_tag_string, appliance=appliance)
        extra_tags = _first(row.iloc[26])
        if parsed["leftover"]:
            extra_tags = ", ".join(filter(None, [extra_tags, *parsed["leftover"]]))

        if not item:
            item = models.ActionItem(pilot_id=pilot_id, action_id=action_id, status="draft")
            db.add(item)

        item.nbi_family = _first(row.iloc[1])
        item.nbi_type = _first(row.iloc[2])
        item.fuel_type = _first(row.iloc[3])
        item.appliance = appliance
        item.description = _first(row.iloc[5])
        item.subject_line_email = _first(row.iloc[6])
        item.footer_disclaimer = _first(row.iloc[7])
        item.channels = _first(row.iloc[8])
        item.short_desc = _first(row.iloc[10], row.iloc[9])
        item.title = _first(row.iloc[12], row.iloc[11])
        item.subject_title_paper = _first(row.iloc[13])
        item.icon_url = _first(row.iloc[14])
        item.image_paper_url = _first(row.iloc[15])
        item.image_email_url = _first(row.iloc[16])
        item.cta_text = _first(row.iloc[17])
        item.cta_link = _first(row.iloc[18])
        item.cta_link_name = _first(row.iloc[19])
        item.utility_objectives = _first(row.iloc[22])
        item.filter_ownership = _first(row.iloc[23])
        item.filter_season = _first(row.iloc[24])
        item.reco_type = parsed["reco_type"]
        item.benefit_scale = parsed["benefit_scale"]
        item.cost_scale = parsed["cost_scale"]
        item.effort_scale = parsed["effort_scale"]
        item.diy = parsed["diy"]
        item.selfie = parsed["selfie"]
        item.income_level = parsed["income_level"]
        item.ownership = parsed["ownership"]
        item.season = parsed["season"]
        item.persona = parsed["persona"]
        item.strike_low = parsed["strike_low"]
        item.strike_high = parsed["strike_high"]
        item.extra_tags = extra_tags
        item.tag_string = build_tag_string(item)
        imported += 1
    return {"imported": imported, "skipped_published": skipped_published}


def import_insights(db, path_or_buffer, pilot_id: int) -> dict:
    df = pd.read_excel(path_or_buffer, sheet_name="Insights", header=INSIGHTS_HEADER_ROW)
    imported = 0
    skipped_published = 0
    for _, row in df.iterrows():
        if pd.isna(row.iloc[1]):
            continue
        insight_id = _id_str(row.iloc[1])

        item = db.query(models.InsightItem).filter_by(pilot_id=pilot_id, insight_id=insight_id).first()
        if item and item.status == "published":
            skipped_published += 1
            continue

        appliance = _first(row.iloc[0])
        raw_tag_string = _first(row.iloc[16])
        parsed = parse_insight_tag_string(raw_tag_string, appliance=appliance)
        extra_tags = _first(row.iloc[17])
        if parsed["leftover"]:
            extra_tags = ", ".join(filter(None, [extra_tags, *parsed["leftover"]]))

        if not item:
            item = models.InsightItem(pilot_id=pilot_id, insight_id=insight_id, status="draft")
            db.add(item)

        item.appliance = appliance
        item.fuel_type = _first(row.iloc[2])
        item.channel = _first(row.iloc[3], row.iloc[9])
        item.variable_name = _first(row.iloc[8])
        item.insight_semantic = _first(row.iloc[7], row.iloc[4])
        item.subject_line = _first(row.iloc[11], row.iloc[10])
        item.insight_text = _first(row.iloc[12], row.iloc[5])
        # row.iloc[6] is "char limit for paper - 135 chars" — a live character-count
        # formula cell in the source sheet, not a paper_text fallback. It used to be
        # passed here (a plausible but wrong generalization of the other res./legacy
        # twin-column fallbacks above), which meant any row with a blank
        # insight.res.paperText cell got that formula's *number* stored as paper_text
        # instead of being left empty. Caught via a round-trip diff against the real
        # source file, 2026-07-15 — see the one-off backfill that fixed already-seeded data.
        item.paper_text = _first(row.iloc[13])
        item.icon_url = _first(row.iloc[15], row.iloc[14])
        item.comparison_type = parsed["comparison_type"]
        item.direction = parsed["direction"]
        item.data_source = parsed["data_source"]
        item.season = parsed["season"]
        item.tou_period = parsed["tou_period"]
        item.generic_insight = parsed["generic_insight"]
        item.generic_insight_type = parsed["generic_insight_type"]
        item.challenge_status = parsed["challenge_status"]
        item.min_value = parsed["min_value"]
        item.max_value = parsed["max_value"]
        item.extra_tags = extra_tags
        item.tag_string = build_insight_tag_string(item)
        imported += 1
    return {"imported": imported, "skipped_published": skipped_published}
