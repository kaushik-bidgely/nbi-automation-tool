import { useState } from "react";
import { Box, TextField, IconButton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";

// Click-to-edit: by default shows the FULL text wrapped (never truncated —
// that was the whole complaint), with a pencil icon. Click the text or the
// pencil to switch to an editable textarea; blur commits back to the row's
// local state (the row-level Save button in ActionsList/InsightsList still
// does the actual persist).
//
// `dirty` (unsaved local edit, not yet Saved) tints the cell orange; being
// over `limit` tints it red and wins over `dirty` — both persist in the
// collapsed (non-editing) view too, not just while the textarea is focused,
// so an over-limit or unsaved field stays visibly flagged until it's
// actually fixed/saved, not just while you happen to be typing in it.
export default function EditableCell({
  value, editable, limit, dirty, onChange,
}: {
  value: string; editable: boolean; limit?: number; dirty?: boolean; onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const overLimit = !!limit && value.length > limit;

  if (!editable) {
    return (
      <Typography variant="body2" sx={{ color: "text.disabled", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {value || "—"}
      </Typography>
    );
  }

  if (editing) {
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
        color={dirty && !overLimit ? "warning" : undefined}
        helperText={limit ? `${value.length}/${limit}` : undefined}
        sx={(theme) => ({
          minWidth: 220,
          ...(dirty && !overLimit
            ? { "& .MuiOutlinedInput-root": { bgcolor: alpha(theme.palette.warning.main, 0.08) } }
            : {}),
        })}
      />
    );
  }

  return (
    <Box
      onClick={() => setEditing(true)}
      sx={(theme) => ({
        display: "flex", alignItems: "flex-start", gap: 0.5, cursor: "pointer",
        minWidth: 220, borderRadius: 1, px: 0.5, py: 0.25, border: "1px solid",
        borderColor: overLimit ? "error.main" : dirty ? "warning.main" : "transparent",
        bgcolor: overLimit
          ? alpha(theme.palette.error.main, 0.08)
          : dirty
          ? alpha(theme.palette.warning.main, 0.08)
          : "transparent",
        "&:hover .edit-icon": { opacity: 1 },
      })}
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
