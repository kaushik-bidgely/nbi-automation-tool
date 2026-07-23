import { memo, useEffect, useMemo, useState } from "react";
import {
  Stack, Typography, Autocomplete, TextField, Button, Alert, Paper, Link,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Chip, Checkbox,
  IconButton, Tooltip, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions,
  TablePagination, CircularProgress, Select, MenuItem,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { api } from "../api";
import { useRole } from "../AuthContext";
import { usePilot } from "../PilotContext";
import EditableCell from "../EditableCell";
import DownloadSheetDialog from "../DownloadSheetDialog";
import { downloadCsv } from "../downloadCsv";

type Interaction = Record<string, any>;
type Option = { id: number; label: string };

const statusColor: Record<string, "default" | "warning" | "success" | "info"> = {
  draft: "default", ready_for_qa: "warning", published: "success", modified: "info",
};

// Read-only fields shown only in the detail dialog — everything not directly
// editable in the table (see interaction_logic.compute_fields on the backend).
const DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: "insight_id", label: "Insight ID" },
  { key: "action_id", label: "Action ID (effective)" },
  { key: "tag_insight", label: "Tag — Insight" },
  { key: "tag_action", label: "Tag — Action" },
  { key: "tag_generic", label: "Tag — Generic (shared appliance)" },
  { key: "tag_objective", label: "Tag — Objective" },
  { key: "var_i_name", label: "Variable Name" },
  { key: "filter_utility", label: "Filter — Utility" },
  { key: "filter_ownership", label: "Filter — Ownership" },
  { key: "filter_season", label: "Filter — Season" },
  { key: "nbi_family", label: "NBI Family" },
  { key: "nbi_type", label: "NBI Type (effective)" },
  { key: "nbi_fuel_type", label: "NBI Fuel Type" },
  { key: "nbi_appliance", label: "NBI Appliance" },
  { key: "min", label: "Min" },
  { key: "max", label: "Max" },
];

const InteractionRow = memo(function InteractionRow({
  interaction, selected, onSaved, onError, onUnmerge, onViewDetails, onToggleSelect, onUnlocked, onSubmitted,
}: {
  interaction: Interaction; selected: boolean;
  onSaved: (id: number, fields: Record<string, string>) => void; onError: (msg: string) => void;
  onUnmerge: (interaction: Interaction) => void; onViewDetails: (interaction: Interaction) => void;
  onToggleSelect: (id: number) => void; onUnlocked: (id: number) => void; onSubmitted: (id: number) => void;
}) {
  const [values, setValues] = useState(interaction);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Resync from fresh parent data (e.g. after a bulk merge reload) without
  // clobbering an in-progress unsaved edit — same pattern as ActionsList/InsightsList.
  useEffect(() => {
    setValues((v) => {
      const merged = { ...interaction };
      for (const key of Object.keys(dirty)) merged[key] = v[key];
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction]);

  const locked = values.status === "published";
  const canSubmit = values.status === "draft" || values.status === "modified";

  const onChange = (field: string, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setDirty((d) => ({ ...d, [field]: value }));
  };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const updated = await api.updateInteraction(interaction.id, dirty);
      onSaved(interaction.id, { ...dirty, status: updated.status });
      setDirty({});
    } catch (e: any) {
      onError(`Couldn't save interaction #${interaction.id}: ${String(e.message)}`);
    } finally {
      setSaving(false);
    }
  };

  const unlock = async () => {
    try {
      await api.unlockInteraction(interaction.id);
      onUnlocked(interaction.id);
    } catch (e: any) {
      onError(`Couldn't unlock interaction #${interaction.id}: ${String(e.message)}`);
    }
  };

  const changeStatus = async (newStatus: string) => {
    if (newStatus === values.status || newStatus !== "ready_for_qa" || !canSubmit) return;
    setSubmittingStatus(true);
    try {
      await api.submitInteraction(interaction.id);
      onSubmitted(interaction.id);
    } catch (e: any) {
      onError(`Couldn't move interaction #${interaction.id} to Ready for QA: ${String(e.message)}`);
    } finally {
      setSubmittingStatus(false);
    }
  };

  return (
    <TableRow hover selected={selected}>
      <TableCell padding="checkbox">
        <Checkbox size="small" checked={selected} onChange={() => onToggleSelect(interaction.id)} />
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Tooltip title="View all fields">
          <Link component="button" variant="body2" underline="hover" onClick={() => onViewDetails(values)}>
            {values.nbi_id}
          </Link>
        </Tooltip>
      </TableCell>
      <TableCell sx={{ verticalAlign: "top", minWidth: 240 }}>
        <EditableCell
          value={values.insight_semantic ?? ""} editable={!locked && !selected} dirty={"insight_semantic" in dirty}
          onChange={(v) => onChange("insight_semantic", v)}
        />
      </TableCell>
      <TableCell sx={{ verticalAlign: "top", minWidth: 240 }}>
        <EditableCell
          value={values.insight_text ?? ""} editable={!locked && !selected} dirty={"insight_text" in dirty}
          onChange={(v) => onChange("insight_text", v)}
        />
      </TableCell>
      <TableCell sx={{ verticalAlign: "top", minWidth: 240 }}>
        <EditableCell
          value={values.action ?? ""} editable={!locked && !selected} dirty={"action" in dirty}
          onChange={(v) => onChange("action", v)}
        />
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Select
            size="small" variant="standard" disableUnderline value={values.status}
            disabled={submittingStatus} onChange={(e) => changeStatus(e.target.value)}
            renderValue={(v) => <Chip size="small" label={String(v).replace(/_/g, " ")} color={statusColor[v as string]} />}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="draft" disabled={values.status !== "draft"}>Draft</MenuItem>
            <MenuItem value="ready_for_qa" disabled={values.status !== "ready_for_qa" && !canSubmit}>Ready for QA</MenuItem>
            <MenuItem value="published" disabled={values.status !== "published"}>Published</MenuItem>
            <MenuItem value="modified" disabled={values.status !== "modified"}>Modified</MenuItem>
          </Select>
          {values.seasonal_suffix && <Chip size="small" variant="outlined" label={`seasonal (${values.seasonal_suffix})`} />}
        </Stack>
      </TableCell>
      <TableCell>
        {locked ? (
          <Tooltip title="Unlock to edit (moves to Modified)">
            <IconButton size="small" color="warning" onClick={unlock}>
              <LockOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <IconButton size="small" color="primary" disabled={!Object.keys(dirty).length || saving} onClick={save}>
            <SaveIcon fontSize="small" />
          </IconButton>
        )}
        <IconButton size="small" color="warning" onClick={() => onUnmerge(values)}><DeleteIcon fontSize="small" /></IconButton>
      </TableCell>
    </TableRow>
  );
});

export default function InteractionsView() {
  const { role } = useRole();
  const { pilotId } = usePilot();
  const canEdit = role === "admin";

  const [actionsOpts, setActionsOpts] = useState<Option[]>([]);
  const [insightsOpts, setInsightsOpts] = useState<Option[]>([]);
  const [action, setAction] = useState<Option | null>(null);
  const [insight, setInsight] = useState<Option | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [merging, setMerging] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Interaction | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const load = () => { if (pilotId) api.listInteractions(pilotId).then(setInteractions); };

  useEffect(() => {
    if (!pilotId) return;
    api.listActions(pilotId).then((rows: any[]) =>
      setActionsOpts(rows.map((r) => ({ id: r.id, label: `${r.action_id} — ${r.title ?? ""}` }))),
    );
    api.listInsights(pilotId).then((rows: any[]) =>
      setInsightsOpts(rows.map((r) => ({ id: r.id, label: `${r.insight_id} — ${(r.insight_semantic ?? "").slice(0, 90)}` }))),
    );
    load();
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilotId]);

  const manualMerge = async () => {
    if (!action || !insight) return;
    try {
      await api.createInteraction(action.id, insight.id);
      setAction(null);
      setInsight(null);
      load();
      setSavedMsg("Merged.");
    } catch (e: any) {
      try {
        const parsed = JSON.parse(e.message);
        setErrorMsg(Array.isArray(parsed.issues) ? parsed.issues.join(", ") : String(e.message));
      } catch {
        setErrorMsg(String(e.message));
      }
    }
  };

  const mergeAll = async () => {
    if (!pilotId) return;
    setMerging(true);
    try {
      const res = await api.bulkMergeInteractions(pilotId);
      load();
      setSavedMsg(`Merge All: created ${res.created} new interaction(s), ${res.skipped_existing} already existed (${res.candidates_considered} valid pairs total).`);
    } catch (e: any) {
      setErrorMsg(`Merge All failed: ${String(e.message)}`);
    } finally {
      setMerging(false);
    }
  };

  const onSaved = (id: number, fields: Record<string, string>) => {
    const prev = interactions.find((r) => r.id === id);
    const revertedToDraft = fields.status === "draft" && prev?.status === "ready_for_qa";
    setInteractions((rows) => rows.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    setSavedMsg(revertedToDraft
      ? `Saved interaction #${id} — reverted to Draft (was Ready for QA)`
      : `Saved interaction #${id}`);
  };

  const onUnlocked = (id: number) => {
    setInteractions((rows) => rows.map((r) => (r.id === id ? { ...r, status: "modified" } : r)));
    setSavedMsg(`Unlocked interaction #${id} — now Modified`);
  };

  const onSubmitted = (id: number) => {
    setInteractions((rows) => rows.map((r) => (r.id === id ? { ...r, status: "ready_for_qa" } : r)));
    setSavedMsg(`Interaction #${id} moved to Ready for QA`);
  };

  const toggleSelect = (id: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Scoped to the current page, not every filtered row across all pages —
  // this table can run into the thousands per pilot, so "select all" means
  // "select everything I can currently see."
  const toggleSelectAll = () => {
    setSelected((s) => (paged.every((r) => s.has(r.id)) ? new Set() : new Set(paged.map((r) => r.id))));
  };

  const submitSelected = async () => {
    setBulkSubmitting(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => api.submitInteraction(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    setBulkSubmitting(false);
    load();
    if (failed) setErrorMsg(`${ids.length - failed}/${ids.length} moved to Ready for QA — ${failed} failed`);
    else setSavedMsg(`${ids.length} interaction(s) moved to Ready for QA`);
  };

  const publishSelected = async () => {
    if (!pilotId) return;
    const ids = [...selected];
    const eligible = ids.filter((id) => interactions.find((r) => r.id === id)?.status === "ready_for_qa");
    const skippedUpfront = ids.length - eligible.length;
    if (eligible.length === 0) {
      setErrorMsg("None of the selected rows are Ready for QA — nothing to publish.");
      return;
    }
    setPublishing(true);
    try {
      const res = await api.publishInteractions(pilotId, eligible);
      downloadCsv(res.filename, res.csv);
      setSelected(new Set());
      load();
      const skippedTotal = skippedUpfront + res.skipped_ids.length;
      setSavedMsg(`Published ${res.published_ids.length} interaction(s)${skippedTotal ? ` — ${skippedTotal} skipped (not Ready for QA)` : ""}`);
    } catch (e: any) {
      setErrorMsg(`Couldn't publish: ${String(e.message)}`);
    } finally {
      setPublishing(false);
    }
  };

  const unmerge = async (interaction: Interaction) => {
    try {
      await api.unmergeInteraction(interaction.id);
      setInteractions((rows) => rows.filter((r) => r.id !== interaction.id));
      setSavedMsg(`Un-merged ${interaction.nbi_id}`);
    } catch (e: any) {
      setErrorMsg(String(e.message));
    }
  };

  const downloadSheet = async (statuses: string[]) => {
    if (!pilotId) return;
    const res = await api.exportInteractionsSheet(pilotId, statuses);
    downloadCsv(res.filename, res.csv);
  };

  const filtered = useMemo(
    () => interactions.filter((r) =>
      `${r.nbi_id} ${r.insight_id} ${r.action_id}`.toLowerCase().includes(filter.toLowerCase()),
    ),
    [interactions, filter],
  );
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const allVisibleSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));
  const someVisibleSelected = paged.some((r) => selected.has(r.id));

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Interactions ({interactions.length})</Typography>
      <Typography variant="body2" color="text.secondary">
        An Interaction pairs one Action with one Insight — replaces the manual Script 1 CSV merge. "Merge All" runs
        the same pairing rules as PE's generate_nbi_configs.py across every Action/Insight in this pilot at once.
        Interactions go through the same Draft → Ready for QA → Published → Modified lifecycle as Actions/Insights.
      </Typography>

      {role !== "admin" && <Alert severity="info">You're viewing as {role} — switch to Admin to merge or edit.</Alert>}

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <Autocomplete
          options={actionsOpts} value={action} onChange={(_, v) => setAction(v)}
          sx={{ width: 320 }} renderInput={(p) => <TextField {...p} label="Action" size="small" />}
          disabled={!canEdit}
        />
        <Autocomplete
          options={insightsOpts} value={insight} onChange={(_, v) => setInsight(v)}
          sx={{ width: 320 }} renderInput={(p) => <TextField {...p} label="Insight" size="small" />}
          disabled={!canEdit}
        />
        <Button variant="outlined" disabled={!canEdit || !action || !insight} onClick={manualMerge}>
          Merge
        </Button>
        <Button
          variant="contained" disabled={!canEdit || merging} onClick={mergeAll}
          startIcon={merging ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Merge All
        </Button>
        {canEdit && (
          <Button size="small" variant="outlined" onClick={() => setDownloadOpen(true)}>
            Download Sheet
          </Button>
        )}
        <TextField size="small" label="Filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} sx={{ minWidth: 240 }} />
        {selected.size > 0 && (
          <>
            <Button size="small" variant="contained" disabled={bulkSubmitting} onClick={submitSelected}>
              Move to Ready for QA ({selected.size})
            </Button>
            <Button size="small" variant="contained" color="success" disabled={publishing} onClick={publishSelected}>
              Publish Selected ({selected.size})
            </Button>
          </>
        )}
      </Stack>

      <TableContainer component={Paper}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Tooltip title="Select all on this page — content edits are disabled for selected rows while you move their status in bulk">
                  <Checkbox
                    size="small" checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    onChange={toggleSelectAll}
                  />
                </Tooltip>
              </TableCell>
              <TableCell>NBI ID</TableCell>
              <TableCell>Insight Semantic</TableCell>
              <TableCell>Insight Text</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((r) => (
              <InteractionRow
                key={r.id} interaction={r} selected={selected.has(r.id)}
                onSaved={onSaved} onError={setErrorMsg} onUnmerge={unmerge} onViewDetails={setDetailTarget}
                onToggleSelect={toggleSelect} onUnlocked={onUnlocked} onSubmitted={onSubmitted}
              />
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                    {interactions.length === 0 ? "No interactions merged yet for this pilot." : "No interactions match your filter."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div" count={filtered.length} page={page} onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100, 250]}
        />
      </TableContainer>

      <Dialog open={!!detailTarget} onClose={() => setDetailTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{detailTarget?.nbi_id}</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableBody>
              {DETAIL_FIELDS.map(({ key, label }) => (
                <TableRow key={key}>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{label}</TableCell>
                  <TableCell>{detailTarget?.[key] ?? <em>—</em>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <DownloadSheetDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} onDownload={downloadSheet} />

      <Snackbar open={!!savedMsg} autoHideDuration={3500} onClose={() => setSavedMsg(null)} message={savedMsg} />
      <Snackbar open={!!errorMsg} autoHideDuration={5000} onClose={() => setErrorMsg(null)}>
        <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
    </Stack>
  );
}
