import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  FormGroup, FormControlLabel, Checkbox, Alert,
} from "@mui/material";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "ready_for_qa", label: "Ready for QA" },
  { value: "published", label: "Published" },
  { value: "modified", label: "Modified" },
];

// Shared by Actions/Insights/Interactions list pages' "Download Sheet"
// button — lets the admin pick which statuses to include instead of the
// previously-fixed "Ready for QA or later" filter.
export default function DownloadSheetDialog({
  open, onClose, onDownload,
}: { open: boolean; onClose: () => void; onDownload: (statuses: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>(["ready_for_qa", "published", "modified"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (value: string) => {
    setSelected((s) => (s.includes(value) ? s.filter((v) => v !== value) : [...s, value]));
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await onDownload(selected);
      onClose();
    } catch (e: any) {
      setError(String(e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Download Sheet</DialogTitle>
      <DialogContent>
        <FormGroup>
          {STATUS_OPTIONS.map((o) => (
            <FormControlLabel
              key={o.value}
              control={<Checkbox checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />}
              label={o.label}
            />
          ))}
        </FormGroup>
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={selected.length === 0 || busy} onClick={submit}>
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}
