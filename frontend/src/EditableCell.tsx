import { useState } from "react";
import { Box, TextField, IconButton, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";

// Click-to-edit: by default shows the FULL text wrapped (never truncated —
// that was the whole complaint), with a pencil icon. Click the text or the
// pencil to switch to an editable textarea; blur commits back to the row's
// local state (the row-level Save button in ActionsList/InsightsList still
// does the actual persist).
export default function EditableCell({
  value, editable, limit, onChange,
}: {
  value: string; editable: boolean; limit?: number; onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editable) {
    return (
      <Typography variant="body2" sx={{ color: "text.disabled", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {value || "—"}
      </Typography>
    );
  }

  if (editing) {
    const overLimit = !!limit && value.length > limit;
    return (
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        autoFocus
        multiline
        minRows={2}
        size="small"
        fullWidth
        error={overLimit}
        helperText={limit ? `${value.length}/${limit}` : undefined}
        sx={{ minWidth: 220 }}
      />
    );
  }

  return (
    <Box
      onClick={() => setEditing(true)}
      sx={{
        display: "flex", alignItems: "flex-start", gap: 0.5, cursor: "pointer",
        minWidth: 220, "&:hover .edit-icon": { opacity: 1 },
      }}
    >
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1 }}>
        {value || <em style={{ color: "#bbb" }}>empty</em>}
      </Typography>
      <IconButton size="small" className="edit-icon" sx={{ opacity: 0.3, p: 0.25 }}>
        <EditIcon fontSize="inherit" />
      </IconButton>
    </Box>
  );
}
