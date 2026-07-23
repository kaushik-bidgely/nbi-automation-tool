import { useState } from "react";
import {
  Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper,
  Button, Chip, Alert, Snackbar, CircularProgress,
} from "@mui/material";
import { api } from "../api";
import { usePilot } from "../PilotContext";
import CreatePilotDialog from "../CreatePilotDialog";

type UploadKind = "actions" | "insights" | "interactions";

const ACCEPT: Record<UploadKind, string> = { actions: ".xlsx", insights: ".xlsx", interactions: ".csv" };
const LABEL: Record<UploadKind, string> = { actions: "Upload Actions", insights: "Upload Insights", interactions: "Upload Interactions" };

export default function PilotsAdmin() {
  const { pilots, refreshPilots } = usePilot();
  const [busy, setBusy] = useState<{ pilotId: number; kind: UploadKind } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleUpload = async (pilotId: number, kind: UploadKind, file: File) => {
    setBusy({ pilotId, kind });
    try {
      const res = kind === "actions" ? await api.uploadActionsSheet(pilotId, file)
        : kind === "insights" ? await api.uploadInsightsSheet(pilotId, file)
        : await api.uploadInteractionsSheet(pilotId, file);
      const parts: string[] = [];
      if (kind === "interactions" && res.unmatched) parts.push(`${res.unmatched} skipped (no matching Action/Insight in this pilot)`);
      if (res.skipped_published) parts.push(`${res.skipped_published} skipped (already Published — unlock first to update those)`);
      const extra = parts.length ? `, ${parts.join("; ")}` : "";
      setResult(`Imported ${res.imported} ${kind}${extra}.`);
      refreshPilots();
    } catch (e: any) {
      let detail: unknown;
      try { detail = JSON.parse(e.message); } catch { detail = e.message; }
      setErrorMsg(typeof detail === "string" ? detail : `Upload failed for ${kind}.`);
    } finally {
      setBusy(null);
    }
  };

  const fileButton = (pilotId: number, kind: UploadKind) => {
    const rowBusy = busy?.pilotId === pilotId && busy.kind === kind;
    return (
      <Button
        component="label" size="small" variant="outlined" disabled={!!busy}
        startIcon={rowBusy ? <CircularProgress size={14} /> : undefined}
      >
        {LABEL[kind]}
        <input
          type="file" hidden accept={ACCEPT[kind]}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-selecting the same file next time
            if (file) handleUpload(pilotId, kind, file);
          }}
        />
      </Button>
    );
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Pilots ({pilots.length})</Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>Create Pilot</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Upload an Actions or Insights sheet (.xlsx) or an Interactions sheet (.csv, same 20-column format this
        app's own Interaction export produces) directly onto an existing pilot. Rows are matched by their
        action/insight ID and updated in place; new IDs are added. Items already Published are left untouched —
        unlock them first if they need to change.
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Pilot</TableCell>
              <TableCell>Code</TableCell>
              <TableCell></TableCell>
              <TableCell align="right">Actions sheet</TableCell>
              <TableCell align="right">Insights sheet</TableCell>
              <TableCell align="right">Interactions sheet</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pilots.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.code}</TableCell>
                <TableCell>{p.is_master && <Chip size="small" label="Master" />}</TableCell>
                <TableCell align="right">{fileButton(p.id, "actions")}</TableCell>
                <TableCell align="right">{fileButton(p.id, "insights")}</TableCell>
                <TableCell align="right">{fileButton(p.id, "interactions")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <CreatePilotDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Snackbar open={!!result} autoHideDuration={5000} onClose={() => setResult(null)}>
        <Alert severity="success" onClose={() => setResult(null)}>{result}</Alert>
      </Snackbar>
      <Snackbar open={!!errorMsg} autoHideDuration={5000} onClose={() => setErrorMsg(null)}>
        <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
    </Stack>
  );
}
