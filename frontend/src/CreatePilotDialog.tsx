import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  Stack, RadioGroup, FormControlLabel, Radio, Alert, Typography,
} from "@mui/material";
import { api } from "./api";
import { usePilot } from "./PilotContext";

export default function CreatePilotDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setPilotId, refreshPilots } = usePilot();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"clone" | "upload">("clone");
  const [actionsFile, setActionsFile] = useState<File | null>(null);
  const [insightsFile, setInsightsFile] = useState<File | null>(null);
  const [interactionsFile, setInteractionsFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCode(""); setName(""); setMode("clone");
    setActionsFile(null); setInsightsFile(null); setInteractionsFile(null); setError(null);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    let createdPilotId: number | null = null;
    const succeeded: string[] = [];
    try {
      const pilot = await api.createPilot(code, name);
      createdPilotId = pilot.id;
      if (mode === "clone") {
        await api.cloneFromMaster(pilot.id);
      } else {
        if (actionsFile) { await api.uploadActionsSheet(pilot.id, actionsFile); succeeded.push("Actions"); }
        if (insightsFile) { await api.uploadInsightsSheet(pilot.id, insightsFile); succeeded.push("Insights"); }
        if (interactionsFile) { await api.uploadInteractionsSheet(pilot.id, interactionsFile); succeeded.push("Interactions"); }
      }
      refreshPilots();
      setPilotId(pilot.id);
      reset();
      onClose();
    } catch (e: any) {
      let detail: unknown;
      try { detail = JSON.parse(e.message); } catch { detail = e.message; }
      const baseMsg = typeof detail === "string" ? detail : String(e.message);
      if (succeeded.length === 0) {
        // Nothing of value was created yet — safe to clean up, same as
        // before, so retrying with the same code doesn't 409.
        setError(baseMsg);
        if (createdPilotId !== null) {
          try { await api.deletePilot(createdPilotId); refreshPilots(); } catch { /* best-effort cleanup */ }
        }
      } else {
        // Partial success — deleting the pilot here would silently discard
        // real imports. Keep it and tell the user exactly what to redo.
        setError(`${baseMsg} (${succeeded.join(", ")} already imported successfully — pilot was kept; re-upload just the failed file from the Pilots page.)`);
        refreshPilots();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Pilot</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Pilot code (e.g. NWN)" value={code} onChange={(e) => setCode(e.target.value)} size="small" fullWidth />
          <TextField label="Pilot name (e.g. Northwestern Energy)" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth />

          <Typography variant="subtitle2">Populate Actions & Insights from:</Typography>
          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as "clone" | "upload")}>
            <FormControlLabel value="clone" control={<Radio />} label="Master Catalog (clone the global defaults)" />
            <FormControlLabel value="upload" control={<Radio />} label="Upload pilot-specific Actions/Insights files" />
          </RadioGroup>

          {mode === "upload" && (
            <Stack spacing={1}>
              <Button component="label" variant="outlined" size="small">
                {actionsFile ? actionsFile.name : "Choose Actions sheet (.xlsx)"}
                <input type="file" hidden accept=".xlsx" onChange={(e) => setActionsFile(e.target.files?.[0] ?? null)} />
              </Button>
              <Button component="label" variant="outlined" size="small">
                {insightsFile ? insightsFile.name : "Choose Insights sheet (.xlsx)"}
                <input type="file" hidden accept=".xlsx" onChange={(e) => setInsightsFile(e.target.files?.[0] ?? null)} />
              </Button>
              <Button component="label" variant="outlined" size="small">
                {interactionsFile ? interactionsFile.name : "Choose Interactions sheet (.csv) — optional"}
                <input type="file" hidden accept=".csv" onChange={(e) => setInteractionsFile(e.target.files?.[0] ?? null)} />
              </Button>
              <Typography variant="caption" color="text.secondary">
                If an Actions/Insights workbook has only one sheet, it's used regardless of its name — if it has
                multiple sheets, one must be named exactly "Actions"/"Insights" so we know which to read. Both must
                match the master template's column layout. The Interactions file (if any) is a CSV in the same
                20-column format this app's own interaction export produces — rows are matched against the
                Actions/Insights just uploaded above.
              </Typography>
            </Stack>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="contained" disabled={!code || !name || busy} onClick={submit}>
          Create Pilot
        </Button>
      </DialogActions>
    </Dialog>
  );
}
