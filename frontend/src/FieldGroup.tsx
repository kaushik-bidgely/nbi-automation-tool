import { TextField, Paper, Typography, Stack } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import type { PermissionMap } from "./AuthContext";

// Shared by ActionEditor and InsightEditor — a titled card of plain text
// fields, gated by the backend-resolved permissions map (GET /api/permissions/*
// — see rbac_matrix.py) rather than a locally-hardcoded editable-field set.
// A field marked "none" for this role is skipped entirely (the backend won't
// have sent its value either); "view" renders disabled; "edit" renders live.
export default function FieldGroup({
  title, fields, data, permissions, charLimits, locked, onChange,
}: {
  title: string; fields: string[]; data: Record<string, any>;
  permissions: PermissionMap; charLimits?: Record<string, number>;
  locked?: boolean;
  onChange: (field: string, value: string) => void;
}) {
  const visibleFields = fields.filter((f) => permissions[f] !== "none");
  if (visibleFields.length === 0) return null;
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom>{title}</Typography>
      <Stack spacing={2}>
        {visibleFields.map((f) => {
          const editable = !locked && permissions[f] === "edit";
          const limit = charLimits?.[f];
          const value = data[f] ?? "";
          const overLimit = !!limit && String(value).length > limit;
          return (
            <TextField
              key={f}
              label={f}
              value={value}
              disabled={!editable}
              onChange={(e) => onChange(f, e.target.value)}
              helperText={
                locked ? "Published — Unlock to edit" :
                !editable ? "View only" :
                limit ? `${String(value).length}/${limit} chars` : undefined
              }
              error={overLimit}
              size="small"
              fullWidth
              multiline={f.includes("description") || f.includes("text")}
              slotProps={!editable ? { input: { endAdornment: <LockIcon fontSize="small" color="disabled" /> } } : undefined}
            />
          );
        })}
      </Stack>
    </Paper>
  );
}
