// Editability/visibility is NOT decided here anymore (2026-07-08) — that
// comes from GET /api/permissions/actions|insights, resolved server-side from
// the single source of truth in backend/app/rbac_matrix.py (see AuthContext's
// usePermissions hook). What's left below is pure UI-layout metadata: which
// fields appear under the Email/Paper toggle, char limits, labels, tag
// vocabulary — presentation concerns, not permission data.

// Table-view scope: exactly 5 inline-editable columns total — 3 Email/Web +
// 2 Paper, toggled by the Email/Paper switch above the table.
export const ACTION_EMAIL_FIELDS = ["description", "subject_line_email", "footer_disclaimer"] as const;
export const ACTION_PAPER_TABLE_FIELDS = ["short_desc", "title"] as const;
export const ACTION_PAPER_FIELDS = [...ACTION_PAPER_TABLE_FIELDS, "subject_title_paper"] as const;
export const ACTION_CHAR_LIMITS: Record<string, number> = { short_desc: 110, title: 55 };

// Insight channel split, mirrors Actions: Email = subject_line + insight_text;
// Paper = insight_semantic + paper_text (matches the sheet's own row-4
// channel annotations).
export const INSIGHT_EMAIL_FIELDS = ["subject_line", "insight_text"] as const;
export const INSIGHT_PAPER_FIELDS = ["insight_semantic", "paper_text"] as const;
export const INSIGHT_CHAR_LIMITS: Record<string, number> = { insight_semantic: 135 };

export const FIELD_LABELS: Record<string, string> = {
  description: "Description (email)",
  subject_line_email: "Subject Line (email)",
  footer_disclaimer: "Footer Disclaimer (email)",
  short_desc: "Short Desc (paper)",
  title: "Title (paper)",
  subject_title_paper: "Subject Title (paper)",
};

// Image dimension requirements — from the master sheet's own column headers
// ("Action.res.image (Width: 425px Height: 550px)" etc). Shown next to each
// image field so the User can't miss the constraint; live-checked against the
// actual loaded image's naturalWidth/naturalHeight.
export const IMAGE_SPECS: Record<string, { width: number; height: number; label: string } | null> = {
  icon_url: null, // no fixed spec in the sheet — preview only
  image_paper_url: { width: 425, height: 550, label: "Paper image" },
  image_email_url: { width: 1200, height: 520, label: "Email image" },
};

// Structured tag vocabulary — mirrors backend/app/tag_logic.py exactly.
export const RECO_TYPES = [
  { value: "edu", label: "Educational" },
  { value: "prod", label: "Product" },
  { value: "prog", label: "Program" },
  { value: "tip", label: "Tip" },
];
export const BENEFIT_SCALE = [
  { value: "b_no", label: "None" },
  { value: "b_low", label: "Low (<50 kWh/mo)" },
  { value: "b_med", label: "Medium (50-180 kWh/mo)" },
  { value: "b_high", label: "High (>200 kWh/mo)" },
];
export const COST_SCALE = [
  { value: "c_no", label: "None" }, { value: "c_low", label: "Low" },
  { value: "c_med", label: "Medium" }, { value: "c_high", label: "High" },
];
export const EFFORT_SCALE = [
  { value: "e_no", label: "None" }, { value: "e_low", label: "Low" },
  { value: "e_med", label: "Medium" }, { value: "e_high", label: "High" },
];
export const INCOME_LEVELS = [
  { value: "inc_low", label: "Low income" }, { value: "inc_med", label: "Medium income" }, { value: "inc_high", label: "High income" },
];
export const OWNERSHIP = [{ value: "owner", label: "Owner" }, { value: "renter", label: "Renter" }];
export const SEASONS = [
  { value: "pre_summer", label: "Pre-Summer" }, { value: "peak_summer", label: "Peak Summer" }, { value: "post_summer", label: "Post-Summer" },
  { value: "pre_winter", label: "Pre-Winter" }, { value: "peak_winter", label: "Peak Winter" }, { value: "post_winter", label: "Post-Winter" },
];
export const PERSONAS = [{ value: "tou", label: "Time-of-Use" }, { value: "green", label: "Green/Eco" }];

// Insight tag vocabulary — mirrors backend/app/tag_logic.py's Insight section.
// Scoped to the core categories; the long tail stays in extra_tags (see backend comment).
export const COMPARISON_TYPES = [
  { value: "peer", label: "Peer" }, { value: "self", label: "Self" },
  { value: "rate", label: "Rate" }, { value: "behav", label: "Behavioral" },
];
export const DIRECTIONS = [
  { value: "neg", label: "Negative" }, { value: "neu", label: "Neutral" }, { value: "pos", label: "Positive" },
];
export const DATA_SOURCES = [
  { value: "bill_amt", label: "Bill Amount" }, { value: "high_usage", label: "High Usage Event" },
  { value: "pk_consumption", label: "Peak Hour Consumption" },
];
export const INSIGHT_SEASONS = [{ value: "summer", label: "Summer" }, { value: "winter", label: "Winter" }];
export const TOU_PERIODS = [
  { value: "tou_peak", label: "Peak" }, { value: "tou_midpeak", label: "Mid Peak" },
  { value: "tou_offpeak", label: "Off Peak" }, { value: "tou_all", label: "All Hours" },
];
export const GENERIC_INSIGHT_TYPES = [
  { value: "gen_welcome", label: "Welcome" }, { value: "gen_edu_tip", label: "Educational Tip" },
  { value: "gen_feature", label: "Feature" }, { value: "gen_seasonal", label: "Seasonal" },
  { value: "gen_feel_good", label: "Feel Good" }, { value: "gen_green", label: "Green" },
];
export const CHALLENGE_STATUSES = [
  { value: "chlg_bad", label: "Doing Worse Than Target" }, { value: "chlg_good", label: "Doing Better Than Target" },
];
