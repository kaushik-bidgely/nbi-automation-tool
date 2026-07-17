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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCode(""); setName(""); setMode("clone"); setActionsFile(null); setInsightsFile(null); setError(null);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const pilot = await api.createPilot(code, name);
      if (mode === "clone") {
        await api.cloneFromMaster(pilot.id);
      } else {
        if (actionsFile) await api.uploadActionsSheet(pilot.id, actionsFile);
        if (insightsFile) await api.uploadInsightsSheet(pilot.id, insightsFile);
      }
      refreshPilots();
      setPilotId(pilot.id);
      reset();
      onClose();
    } catch (e: any) {
      setError(String(e.message));
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
              <Typography variant="caption" color="text.secondary">
                Each file must have the sheet named "Actions" or "Insights" respectively, matching the master template's column layout.
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
