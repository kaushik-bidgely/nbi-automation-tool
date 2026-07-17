"""
Reconstructs the original master-sheet column layout (73 columns for Actions,
102 for Insights — see `Actions and Insights (Kaushik).xlsx`) from an item's
structured fields, for the Admin "Publish" bulk export.

Every one-hot flag column's true value is exactly its own tag_string token
(verified directly against the source file — e.g. the "Benefit ... medium"
column contains the literal string "b_med", not 1/0), so generation is
deterministic: for each vocabulary token in the sheet's own column order,
write the token if the item's structured field matches, else leave blank.

Known source-file quirk, replicated intentionally: on the Insights sheet, the
appliance identity column uses code "lt" for Lighting, but that row's own
"Appliance = Lighting" flag column contains "li" instead of "lt". Confirmed
against the real file, not a bug in this code.

Columns with no structured-field backing in this tool (Insights' long-tail —
per-month/weekday flags, event-date markers, gas-user-segment, aggregation
type) are intentionally left blank on export. This mirrors the scoping
decision already made in tag_logic.py: that long tail lives in `extra_tags`
free text, not as first-class fields, so it can't be reconstructed
column-by-column. Flagged here, not silently pretended away.
"""
import csv
import io

from .tag_logic import (
    RECO_TYPES, BENEFIT_SCALE, COST_SCALE, EFFORT_SCALE, INCOME_LEVELS, OWNERSHIP, PERSONAS,
    COMPARISON_TYPES, DIRECTIONS, DATA_SOURCES, INSIGHT_SEASONS, TOU_PERIODS, GENERIC_INSIGHT_TYPES,
    CHALLENGE_STATUSES,
)

# The sheet's own column order for winter (peak, pre, post) does NOT match
# tag_logic.SEASONS' dict insertion order (pre, peak, post) — verified against
# the real file. Season columns must use this explicit order, not dict
# iteration, or peak/pre winter flags land in the wrong column.
ACTION_SEASON_COLUMN_ORDER = ["pre_summer", "peak_summer", "post_summer", "peak_winter", "pre_winter", "post_winter"]

ACTION_APPLIANCE_FLAGS = [
    ("sh", "Appliance = space heater"),
    ("ac", "Appliance = cooling"),
    ("ao", "Appliance = always on"),
    ("ev", "Appliance = Electric Vehicle"),
    ("hvac", "Appliance = HVAC"),
    ("li", "Appliance = Lighting"),
    ("pp", "Appliance = pool pump"),
    ("ref", "Appliance = refrigerator"),
    ("solar", "Appliance = solar"),
    ("ld", "Appliance = laundry"),
    ("ck", "Appliance = cooking"),
    ("ent", "Appliance = entertainment"),
    ("to", "Appliance = Total consumption"),
    ("wh", "Appliance = water heater"),
]

# (appliance code as stored, flag value to write) — see the "lt"/"li" quirk above.
INSIGHT_APPLIANCE_FLAGS = [
    ("ac", "ac", "Appliance = cooling"),
    ("ao", "ao", "Appliance = always on"),
    ("ev", "ev", "Appliance = Electric Vehicle"),
    ("hvac", "hvac", "Appliance = HVAC"),
    ("lt", "li", "Appliance = Lighting"),
    ("pp", "pp", "Appliance = pool pump"),
    ("ref", "ref", "Appliance = refrigerator"),
    ("sh", "sh", "Appliance = space heater"),
    ("ld", "ld", "Appliance = laundry"),
    ("ck", "ck", "Appliance = cooking"),
    ("ent", "ent", "Appliance = entertainment"),
    ("wh", "wh", "Appliance = water heater"),
    ("to", "to", "Appliance = Total consumption"),
    ("vac", "vac", "Appliance = vacation"),
    ("solar", "solar", "Appliance = solar"),
]

ACTIONS_HEADERS = [
    "Action ID", "NBI.Family", "NBI.Type", "NBI.FuelType", "appliance",
    "Action.description\n", "NBI.res.SubjectLine\n(en_US) [EMAILS]", "NBI.res.FooterDisclaimerText",
    "Action.channels",
    "Action.res.shortDesc\n(en_US)\nMax char - 110",
    "Action.res.shortDesc\n(en_US)\nMax char - 110\n[utility input]",
    "Actions.res.title\n(en_US)\nMax char - 55",
    "Actions.res.title\n(en_US)\nMax char - 55\n[utility input]",
    "NBI.res.SubjectTitle\n(en_US) [PAPER]", "Actions.res.icon\n(en_US)",
    "Action.res.image \n(Width: 425px\nHeight: 550px)", "Action.res.image\n(Width: 1200px\nHeight: 520px)",
    "Action.Target(NBI).res.CTA_text\n(en_US)", "Action.Target(NBI).res.CTA_link",
    "Action.Target(NBI).res.CTA_link\n_NAME", "Action.Target(NBI).res.SubjectLine",
    "NBI Set Tag (legacy field, not used in the engine)", "NBI.utilityObjectives",
    "NBI.filters.ownership", "NBI.filters.season", "desc\n\n\n\n\nTag string", "extra tags",
    "Action is a educational recommendation", "Action is a product recommendation",
    "Action is a program recommendation", "Action is a tip recommendation", "Do it yourself",
    "Benefit of doing the action is none", "Benefit of doing the action is low (about <50 kWh/month)",
    "Benefit of doing the action is medium (about <150-180 kWh/month)",
    "Benefit of doing the action is high (about >200-220 kWh/month)",
    "Cost of doing the action is none", "Cost of doing the action is low",
    "Cost of doing the action is medium", "Cost of doing the action is high",
    "Action requires user to take a selfie",
    "Effort of doing the action is none", "Effort of doing the action is low",
    "Effort of doing the action is medium", "Effort of doing the action is high",
    "action targeted preferably to low-income customers",
    "action targeted preferably to medium-income customers",
    "action targeted preferably to high-income customers",
    "action targeted preferably to owners", "action targeted preferably to renters",
    "action targeted preferably in pre summer period", "action targeted preferably in peak summer period",
    "action targeted preferably in post summer period", "action targeted preferably in peak winter period",
    "action targeted preferably in pre winter period", "action targeted preferably in post winter period",
    "action targeted to a TOU persona", "action targeted to a GREEN / ECO persona",
    "Appliance = space heater", "Appliance = cooling", "Appliance = always on", "Appliance = Electric Vehicle",
    "Appliance = HVAC", "Appliance = Lighting", "Appliance = pool pump", "Appliance = refrigerator",
    "Appliance = solar", "Appliance = laundry", "Appliance = cooking", "Appliance = entertainment",
    "Appliance = Total consumption", "Appliance = water heater",
    "Strike count with [low] and [high] thresholds",
]

INSIGHTS_HEADERS = [
    "appliance", "insight.ID", "fuel.type", "channel", "insight.semantic", "insight.text",
    "char limit for paper - 135 chars", "insight.semantic [utility input]", "insight.variableName",
    "insight.channel", "insight.res.subjectLine", "insight.res.subjectLine [utility input]",
    "insight.res.text", "insight.res.paperText", "insight.res.icon", "insight.res.icon [utility input]",
    "desc\n\n\n\n\nTag string", "extra tags",
    "Comparison with peer", "Comparison with self", "Rate Comparison",
    "Behavioral comparison (evaluating the user's behavior against specific rules or logic)",
    "reference - actual = inefficient", "reference - actual = zero", "reference - actual = efficient",
    "Comparison of Bill Amount", "High Usage event", "Peak hour consumption event",
    '"x" number of billing cycle', '"x" number of days', '"x" number of months', '"x" number of billing weeks',
    '"x-y-z-..." names of defined months [jan-feb-mar-apr-may-jun-jul-aug-sep-oct-nov-dec]',
    "Season = summer", "Season = winter", "Weekday", "Weekend",
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December", "Month to date", "Year to date",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "Challenge subscription date to today", "Peak ", "Mid Peak", "Off Peak", "All hours",
    "bill cycle on bill cycle", "month on month", "year on year", "period over rest of year",
    "insight relevant only in summer period", "insight relevant only in winter period",
    "Denotes calculation that refers to average monthly consumption/cost",
    "Appliance = cooling", "Appliance = always on", "Appliance = Electric Vehicle", "Appliance = HVAC",
    "Appliance = Lighting", "Appliance = pool pump", "Appliance = refrigerator", "Appliance = space heater",
    "Appliance = laundry", "Appliance = cooking", "Appliance = entertainment", "Appliance = water heater",
    "Appliance = Total consumption", "Appliance = vacation", "Appliance = solar",
    "Denotes a generic insight, applicable to users with little or no data",
    'Denotes a generic insight of type: "Consent Welcome"',
    'Denotes a generic insight of type: "Educational Tip"',
    'Denotes a generic insight of type: "Feature" (promoting a specific feature in Bidgely\'s solution)',
    'Denotes a generic insight of type: "Seasonal"', 'Denotes a generic insight of type: "Feel Good"',
    'Denotes a generic insight of type: "Green"',
    'Denotes a yearly recurring event date in the form [MMDD]. For example: "evt_date_1225".',
    "Denotes a yearly recurring event specified by a given name.",
    'Denotes a yearly recurring event date, where the date cannot be determined by a fixed date. '
    'For example: "the 1st Thursday in March", or "the last Monday in April".',
    "This tag it used together with one of the previous evt tags, to define the validity period for the NBI, "
    'relative to the specified date. \nFor example: evt_validty_-10_-2 for an NBI with evt_date_1225, '
    "indicates that the NBI will be scored only in the dates between 12/15 and 12/23.",
    "Denotes challenge status when user it doing worse than the target.",
    "Denotes challenge status when user it doing better than the target.",
    "Denotes minimum value for $ insights", "Denotes maximum value for $ insights",
    "Gas SMB users", "Gas resi users",
]


def _flag(value, token):
    return token if value == token else ""


def _flag_in(values, token):
    return token if values and token in values else ""


# Free-text fields (description, title, extra_tags, etc.) are user-entered and
# flow straight into this CSV, which Delivery/PE open in Excel — a value
# starting with =, +, -, or @ would be interpreted as a live formula there
# (classic CSV/formula injection). Prefixing with a quote neutralizes it
# without changing what a human sees in the cell.
_FORMULA_TRIGGER_CHARS = ("=", "+", "-", "@")


def sanitize_csv_cell(value):
    if isinstance(value, str) and value[:1] in _FORMULA_TRIGGER_CHARS:
        return "'" + value
    return value


def _safe_row(row: list) -> list:
    return [sanitize_csv_cell(v) for v in row]


def build_action_row(item) -> list:
    row = [
        item.action_id, item.nbi_family, item.nbi_type, item.fuel_type, item.appliance,
        item.description, item.subject_line_email, item.footer_disclaimer, item.channels,
        item.short_desc, item.short_desc,   # canonical + [utility input] twin, collapsed to one field
        item.title, item.title,             # canonical + [utility input] twin, collapsed to one field
        item.subject_title_paper, item.icon_url, item.image_paper_url, item.image_email_url,
        item.cta_text, item.cta_link, item.cta_link_name,
        "",  # Action.Target(NBI).res.SubjectLine — never captured on import, not recoverable
        "",  # NBI Set Tag (legacy field, not used in the engine)
        item.utility_objectives, item.filter_ownership, item.filter_season,
        item.tag_string, item.extra_tags,
    ]
    row += [_flag(item.reco_type, t) for t in RECO_TYPES]
    row += [item.diy and "diy" or ""]
    row += [_flag(item.benefit_scale, t) for t in BENEFIT_SCALE]
    row += [_flag(item.cost_scale, t) for t in COST_SCALE]
    row += [item.selfie and "selfie" or ""]
    row += [_flag(item.effort_scale, t) for t in EFFORT_SCALE]
    row += [_flag_in(item.income_level, t) for t in INCOME_LEVELS]
    row += [_flag_in(item.ownership, t) for t in OWNERSHIP]
    row += [_flag_in(item.season, t) for t in ACTION_SEASON_COLUMN_ORDER]
    row += [_flag_in(item.persona, t) for t in PERSONAS]
    row += [_flag(item.appliance, code) for code, _ in ACTION_APPLIANCE_FLAGS]
    row.append(f"strike_{item.strike_low}_{item.strike_high}" if item.strike_low is not None and item.strike_high is not None else "")
    assert len(row) == len(ACTIONS_HEADERS), f"{len(row)} != {len(ACTIONS_HEADERS)}"
    return row


def build_insight_row(item) -> list:
    """Built by explicit column index, not sequential appends — the sheet's
    102 columns interleave modeled and long-tail (blank) ranges in a way
    that's easy to miscount if you just chain `row += [...]` calls."""
    row = [""] * len(INSIGHTS_HEADERS)
    row[0:18] = [
        # index 6 ("char limit for paper - 135 chars") is a live character-count
        # formula cell in the source sheet, not a content field — no structured
        # field backs it, so it stays blank like the rest of the long tail
        # (it used to incorrectly hold paper_text — caught during a round-trip
        # diff against the real source file, 2026-07-15).
        item.appliance, item.insight_id, item.fuel_type, item.channel,
        item.insight_semantic, item.insight_text, "", item.insight_semantic,
        item.variable_name, item.channel, item.subject_line, item.subject_line,
        item.insight_text, item.paper_text, item.icon_url, item.icon_url,
        item.tag_string, item.extra_tags,
    ]
    row[18:22] = [_flag(item.comparison_type, t) for t in COMPARISON_TYPES]           # peer/self/rate/behav
    row[22:25] = [_flag(item.direction, t) for t in DIRECTIONS]                       # neg/neu/pos -> inefficient/zero/efficient
    row[25:28] = [_flag(item.data_source, t) for t in DATA_SOURCES]                   # bill_amt/high_usage/pk_consumption
    # 28-32 billing-cycle/day/month/week counters, month-list marker — long tail, not modeled
    row[33:35] = [_flag_in(item.season, t) for t in INSIGHT_SEASONS]                  # summer/winter
    # 35-58 weekday/weekend, month names, MTD/YTD, weekday names, challenge-sub-date — long tail, not modeled
    row[59:63] = [_flag_in(item.tou_period, t) for t in TOU_PERIODS]                  # peak/mid/off/all
    # 63-69 bill/month/year-over-*, seasonal-relevance flags, avg-monthly marker — long tail, not modeled
    row[70:85] = [(flag_value if item.appliance == stored_code else "") for stored_code, flag_value, _ in INSIGHT_APPLIANCE_FLAGS]
    row[85] = item.generic_insight and "generic" or ""
    row[86:92] = [_flag(item.generic_insight_type, t) for t in GENERIC_INSIGHT_TYPES]  # welcome/edu_tip/feature/seasonal/feel_good/green
    # 92-95 event-date tags (yearly recurring / named / relative / validity window) — long tail, not modeled
    row[96:98] = [_flag(item.challenge_status, t) for t in CHALLENGE_STATUSES]         # chlg_bad/chlg_good
    row[98] = item.min_value if item.min_value is not None else ""
    row[99] = item.max_value if item.max_value is not None else ""
    # 100-101 Gas SMB / Gas resi users — long tail, not modeled
    assert len(row) == len(INSIGHTS_HEADERS), f"{len(row)} != {len(INSIGHTS_HEADERS)}"
    return row


def export_actions_csv(items) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(ACTIONS_HEADERS)
    for item in items:
        writer.writerow(_safe_row(build_action_row(item)))
    return buf.getvalue()


def export_insights_csv(items) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(INSIGHTS_HEADERS)
    for item in items:
        writer.writerow(_safe_row(build_insight_row(item)))
    return buf.getvalue()
