// Mirrors backend/app/tag_logic.py build_tag_string — used only to show a
// live preview before Save; the server regenerates the authoritative
// tag_string on save using the same logic.
export function buildTagStringPreview(v: Record<string, any>): string {
  const parts: string[] = [];
  if (v.reco_type) parts.push(v.reco_type);
  if (v.diy) parts.push("diy");
  if (v.benefit_scale) parts.push(v.benefit_scale);
  if (v.cost_scale) parts.push(v.cost_scale);
  if (v.selfie) parts.push("selfie");
  if (v.effort_scale) parts.push(v.effort_scale);
  for (const field of ["income_level", "ownership", "season", "persona"]) {
    parts.push(...(v[field] || []));
  }
  if (v.appliance) parts.push(v.appliance);
  if (v.strike_low != null && v.strike_high != null) parts.push(`strike_${v.strike_low}_${v.strike_high}`);
  return parts.join(" | ");
}

// Mirrors backend/app/tag_logic.py build_insight_tag_string.
export function buildInsightTagStringPreview(v: Record<string, any>): string {
  const parts: string[] = [];
  if (v.comparison_type) parts.push(v.comparison_type);
  if (v.direction) parts.push(v.direction);
  if (v.data_source) parts.push(v.data_source);
  parts.push(...(v.season || []));
  parts.push(...(v.tou_period || []));
  if (v.generic_insight) parts.push("generic");
  if (v.generic_insight_type) parts.push(v.generic_insight_type);
  if (v.challenge_status) parts.push(v.challenge_status);
  if (v.min_value != null) parts.push(`min_${v.min_value}`);
  if (v.max_value != null) parts.push(`max_${v.max_value}`);
  if (v.appliance) parts.push(v.appliance);
  return parts.join(" | ");
}
