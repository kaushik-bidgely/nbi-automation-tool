import { useEffect, useState } from "react";
import {
  Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, Paper, Alert, Chip, Button, Snackbar,
} from "@mui/material";
import { api } from "../api";
import { usePilot } from "../PilotContext";

const statusColor: Record<string, "default" | "warning" | "success" | "info"> = {
  draft: "default", ready_for_qa: "warning", published: "success", modified: "info",
};

// Utility accounts are read-only content-wise and scoped server-side (pilot,
// content type, channel) — whatever fields the API returns for this account
// IS the full set they're allowed to see, so this renders dynamically rather
// than hard-coding a field list like the TPM/CSM tables do. The one write
// action they DO have (2026-07-06): moving their own Draft/Modified rows to
// Ready for QA, same as every other role.
export default function UtilityContentView({ kind }: { kind: "action" | "insight" }) {
  const { pilotId } = usePilot();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);

  const load = () => {
    if (!pilotId) return;
    setError(null);
    const fn = kind === "action" ? api.listActions : api.listInsights;
    fn(pilotId).then(setRows).catch((e) => {
      // api.ts sets e.message to JSON.stringify(detail) — parse it back once
      // to recover the original value (usually a plain string for a 403 from
      // check_pilot_access, occasionally an object for other error shapes).
      let detail: unknown;
      try { detail = JSON.parse(e.message); } catch { detail = e.message; }
      setError(typeof detail === "string" ? detail : "Not available for this account");
    });
  };
  useEffect(load, [pilotId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const idKey = kind === "action" ? "action_id" : "insight_id";
  const columns = rows[0] ? Object.keys(rows[0]).filter((k) => k !== "id" && k !== "status" && k !== "merged") : [];

  const moveToQA = async (row: Record<string, any>) => {
    setSubmitting(row.id);
    try {
      const fn = kind === "action" ? api.submitAction : api.submitInsight;
      await fn(row.id);
      load();
    } catch (e: any) {
      const parsed = JSON.parse(e.message);
      setErrorMsg(Array.isArray(parsed.issues) ? parsed.issues.join(", ") : String(e.message));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5">
        {kind === "action" ? "Actions" : "Insights"} ({rows.length}) — content read-only
      </Typography>
      {error && <Alert severity="info">{error}</Alert>}
      {!error && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {columns.map((c) => <TableCell key={c}>{c.replace(/_/g, " ")}</TableCell>)}
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r[idKey]}>
                  {columns.map((c) => (
                    <TableCell key={c} sx={{ whiteSpace: "pre-wrap", verticalAlign: "top" }}>
                      {String(r[c] ?? "")}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Chip size="small" label={String(r.status).replace(/_/g, " ")} color={statusColor[r.status]} />
                      {r.merged && <Chip size="small" label="merged" variant="outlined" />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {(r.status === "draft" || r.status === "modified") && (
                      <Button size="small" disabled={submitting === r.id} onClick={() => moveToQA(r)}>
                        Move to Ready for QA
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Snackbar open={!!errorMsg} autoHideDuration={4000} onClose={() => setErrorMsg(null)}>
        <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
    </Stack>
  );
}
