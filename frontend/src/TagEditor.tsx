import {
  Stack, Typography, TextField, Paper, Box, Chip,
  Select, MenuItem, FormControl, InputLabel, Checkbox, FormControlLabel, OutlinedInput,
} from "@mui/material";
import type { PermissionMap } from "./AuthContext";

type Option = { value: string; label: string };
export type TagField =
  | { type: "single"; field: string; label: string; options: Option[] }
  | { type: "multi"; field: string; label: string; options: Option[] }
  | { type: "bool"; field: string; label: string }
  | { type: "number"; field: string; label: string };

// Shared by ActionEditor and InsightEditor — replaces the old free-text
// tag_string field with structured dropdowns/multi-selects/checkboxes driven
// by a config, so both editors get the same "edit a flag without updating
// the tag string" impossibility without duplicating the rendering logic.
// Gated per-field by the backend-resolved permissions map, not one blanket
// boolean — every tag field happens to share the same edit/view/none value
// per role today (all "internal" category in rbac_matrix.py), but this stays
// correct if that ever differentiates.
export default function TagEditor({
  title, rows, data, permissions, locked, extraTagsField = "extra_tags", preview, onChange,
}: {
  title: string; rows: TagField[][]; data: Record<string, any>; permissions: PermissionMap;
  locked?: boolean; extraTagsField?: string; preview: string; onChange: (field: string, value: any) => void;
}) {
  const isEditable = (field: string) => !locked && permissions[field] === "edit";

  const renderField = (f: TagField) => {
    const editable = isEditable(f.field);
    if (f.type === "single") {
      return (
        <FormControl key={f.field} size="small" fullWidth disabled={!editable}>
          <InputLabel>{f.label}</InputLabel>
          <Select value={data[f.field] ?? ""} label={f.label} onChange={(e) => onChange(f.field, e.target.value)}>
            <MenuItem value=""><em>None</em></MenuItem>
            {f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
      );
    }
    if (f.type === "multi") {
      return (
        <FormControl key={f.field} size="small" fullWidth disabled={!editable}>
          <InputLabel>{f.label}</InputLabel>
          <Select
            multiple value={data[f.field] ?? []} input={<OutlinedInput label={f.label} />}
            onChange={(e) => onChange(f.field, e.target.value as any)}
            renderValue={(selected) => (selected as string[]).map((v) => f.options.find((o) => o.value === v)?.label ?? v).join(", ")}
          >
            {f.options.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                <Checkbox checked={(data[f.field] ?? []).includes(o.value)} size="small" />
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }
    if (f.type === "bool") {
      return (
        <FormControlLabel
          key={f.field}
          control={<Checkbox checked={!!data[f.field]} disabled={!editable} onChange={(e) => onChange(f.field, e.target.checked as any)} />}
          label={f.label}
        />
      );
    }
    return (
      <TextField
        key={f.field} label={f.label} type="number" size="small" disabled={!editable} sx={{ width: 140 }}
        value={data[f.field] ?? ""} onChange={(e) => onChange(f.field, (e.target.value ? Number(e.target.value) : null) as any)}
      />
    );
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom>{title}</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Structured instead of free text — the tag string below is generated from these, it can't drift out of sync.
      </Typography>
      <Stack spacing={2}>
        {rows.map((row, i) => (
          <Stack key={i} direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {row.map(renderField)}
          </Stack>
        ))}
        <TextField
          label="Extra tags (free text escape hatch)" size="small" fullWidth disabled={!isEditable(extraTagsField)}
          value={data[extraTagsField] ?? ""} onChange={(e) => onChange(extraTagsField, e.target.value)}
        />
        <Box>
          <Typography variant="caption" color="text.secondary">Generated tag string preview:</Typography>
          <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {preview.split("|").map((t) => t.trim()).filter(Boolean).map((t) => (
              <Chip key={t} size="small" label={t} />
            ))}
            {!preview && <Typography variant="body2" color="text.disabled">No tags set</Typography>}
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}
