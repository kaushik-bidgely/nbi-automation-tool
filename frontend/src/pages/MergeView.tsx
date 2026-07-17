import { useEffect, useState } from "react";
import {
  Stack, Typography, Autocomplete, TextField, Button, Alert, Paper,
  Table, TableHead, TableRow, TableCell, TableBody, Chip,
} from "@mui/material";
import { api } from "../api";
import { useRole } from "../AuthContext";
import { usePilot } from "../PilotContext";

type Option = { id: number; label: string; raw: any };

export default function MergeView() {
  const { role } = useRole();
  const { pilotId } = usePilot();
  const [actions, setActions] = useState<Option[]>([]);
  const [insights, setInsights] = useState<Option[]>([]);
  const [action, setAction] = useState<Option | null>(null);
  const [insight, setInsight] = useState<Option | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [exported, setExported] = useState<Record<number, string>>({});

  const refreshInteractions = () => { if (pilotId) api.listInteractions(pilotId).then(setInteractions); };

  useEffect(() => {
    if (!pilotId) return;
    api.listActions(pilotId).then((rows: any[]) =>
      setActions(rows.map((r) => ({ id: r.id, label: `${r.action_id} — ${r.title ?? ""}`, raw: r }))),
    );
    api.listInsights(pilotId).then((rows: any[]) =>
      setInsights(rows.map((r) => ({ id: r.id, label: `${r.insight_id} — ${r.insight_semantic ?? ""}`.slice(0, 90), raw: r }))),
    );
    refreshInteractions();
  }, [pilotId]); // eslint-disable-line react-hooks/exhaustive-deps

  const merge = async () => {
    setError(null);
    if (!action || !insight) return;
    try {
      await api.createInteraction(action.id, insight.id);
      setAction(null);
      setInsight(null);
      refreshInteractions();
    } catch (e: any) {
      const parsed = JSON.parse(e.message);
      setError(Array.isArray(parsed.issues) ? parsed.issues.join(", ") : String(e.message));
    }
  };

  const doExport = async (id: number) => {
    const res = await api.exportInteraction(id);
    setExported((m) => ({ ...m, [id]: res.csv }));
    refreshInteractions();
  };

  const unmerge = async (id: number) => {
    try {
      await api.unmergeInteraction(id);
      refreshInteractions();
    } catch (e: any) {
      setError(String(e.message));
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Typography variant="h5">Merge — Action + Insight → Interaction</Typography>
      <Typography variant="body2" color="text.secondary">
        Replaces the manual Script 1 (CSV merge). Admin-only. Runs the pairing
        validation (appliance/fuel match) before allowing the merge — closes gap G4.
      </Typography>

      {role !== "admin" && <Alert severity="info">You're viewing as User — switch to Admin (top right) to merge.</Alert>}

      <Stack direction="row" spacing={2}>
        <Autocomplete
          options={actions} value={action} onChange={(_, v) => setAction(v)}
          sx={{ width: 380 }} renderInput={(p) => <TextField {...p} label="Action" size="small" />}
        />
        <Autocomplete
          options={insights} value={insight} onChange={(_, v) => setInsight(v)}
          sx={{ width: 380 }} renderInput={(p) => <TextField {...p} label="Insight" size="small" />}
        />
        <Button variant="contained" disabled={role !== "admin" || !action || !insight} onClick={merge}>
          Merge
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}

      <Typography variant="h6">Interaction Records</Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell><TableCell>Action</TableCell><TableCell>Insight</TableCell>
              <TableCell>Status</TableCell><TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {interactions.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.id}</TableCell>
                <TableCell>{r.action_item_id}</TableCell>
                <TableCell>{r.insight_item_id}</TableCell>
                <TableCell><Chip size="small" label={r.status} /></TableCell>
                <TableCell>
                  <Button size="small" onClick={() => doExport(r.id)} disabled={role !== "admin"}>
                    Export CSV
                  </Button>
                  <Button size="small" color="warning" onClick={() => unmerge(r.id)} disabled={role !== "admin"}>
                    Un-merge
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {interactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                    No interactions merged yet for this pilot.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {Object.entries(exported).map(([id, csv]) => (
        <Paper key={id} sx={{ p: 2 }}>
          <Typography variant="subtitle2">Interaction {id} — export payload (stand-in for the real push to NBA_asset_data)</Typography>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{csv}</pre>
        </Paper>
      ))}
    </Stack>
  );
}
