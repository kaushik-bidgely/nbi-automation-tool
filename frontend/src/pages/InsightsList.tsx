import { memo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Typography, TextField, Stack, IconButton, Tooltip, Snackbar, Alert,
  ToggleButtonGroup, ToggleButton, Checkbox, Button, Dialog, DialogTitle, DialogActions,
  Select, MenuItem,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { api } from "../api";
import { useRole, usePermissions } from "../AuthContext";
import type { PermissionMap } from "../AuthContext";
import { usePilot } from "../PilotContext";
import EditableCell from "../EditableCell";
import DownloadSheetDialog from "../DownloadSheetDialog";
import { INSIGHT_EMAIL_FIELDS, INSIGHT_PAPER_FIELDS, INSIGHT_CHAR_LIMITS } from "../fieldGroups";
import { downloadCsv } from "../downloadCsv";

type Insight = Record<string, any>;
type Channel = "email" | "paper";
type StatusFilter = "all" | "draft" | "ready_for_qa" | "published" | "modified";

const statusColor: Record<string, "default" | "warning" | "success" | "info"> = {
  draft: "default", ready_for_qa: "warning", published: "success", modified: "info",
};

const FIELDS_BY_CHANNEL: Record<Channel, readonly string[]> = {
  email: INSIGHT_EMAIL_FIELDS,
  paper: INSIGHT_PAPER_FIELDS,
};

// Same row-isolation fix as ActionsList — each row owns its edit state so
// typing doesn't re-render all rows on every keystroke.
const InsightRow = memo(function InsightRow({
  insight, role, permissions, fields, selected, onOpen, onSaved, onError, onToggleSelect, onDelete, onUnlocked, onSubmitted,
}: {
  insight: Insight; role: string; permissions: PermissionMap; fields: readonly string[]; selected: boolean;
  onOpen: (id: number) => void; onSaved: (id: number, fields: Record<string, string>) => void;
  onError: (msg: string) => void; onToggleSelect: (id: number) => void; onDelete: (insight: Insight) => void;
  onUnlocked: (id: number) => void; onSubmitted: (id: number) => void;
}) {
  const [values, setValues] = useState(insight);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // See ActionsList.tsx's matching comment — resync anything not actively
  // being edited whenever the parent reloads (bulk submit, sibling row
  // updates, etc.), so this row can't get stuck showing a stale status.
  useEffect(() => {
    setValues((v) => {
      const merged = { ...insight };
      for (const key of Object.keys(dirty)) merged[key] = v[key];
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when the server-side `insight` prop changes, not on every keystroke into `dirty`
  }, [insight]);

  const locked = values.status === "published";
  // Selected rows are meant for a bulk status move, not simultaneous content
  // edits — editing a Ready-for-QA row silently reverts it to Draft, which
  // would undermine a bulk "move all selected to Ready for QA" in progress.
  const isEditable = (field: string) => !locked && !selected && permissions[field] === "edit";
  const canDelete = role === "admin" || (role === "tpm_csm" && values.status === "draft");
  const canUnlock = locked && (role === "admin" || role === "tpm_csm");
  const canSubmit = values.status === "draft" || values.status === "modified";
  const overLimit = Object.entries(dirty).some(
    ([field, value]) => INSIGHT_CHAR_LIMITS[field] && value.length > INSIGHT_CHAR_LIMITS[field],
  );

  const onChange = (field: string, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setDirty((d) => ({ ...d, [field]: value }));
  };

  const save = async () => {
    if (Object.keys(dirty).length === 0 || overLimit) return;
    setSaving(true);
    try {
      const updated = await api.updateInsight(insight.id, dirty);
      onSaved(insight.id, { ...dirty, status: updated.status });
      setDirty({});
    } catch (e: any) {
      onError(`Couldn't save ${insight.insight_id}: ${String(e.message)}`);
    } finally {
      setSaving(false);
    }
  };

  const unlock = async () => {
    try {
      await api.unlockInsight(insight.id);
      onUnlocked(insight.id);
    } catch (e: any) {
      onError(`Couldn't unlock ${insight.insight_id}: ${String(e.message)}`);
    }
  };

  const changeStatus = async (newStatus: string) => {
    if (newStatus === values.status || newStatus !== "ready_for_qa" || !canSubmit || overLimit) return;
    setSubmittingStatus(true);
    try {
      await api.submitInsight(insight.id);
      onSubmitted(insight.id);
    } catch (e: any) {
      let msg = String(e.message);
      try {
        const parsed = JSON.parse(e.message);
        if (Array.isArray(parsed.issues)) msg = parsed.issues.join(", ");
      } catch { /* not a validation-issues payload — use the raw message */ }
      onError(`Couldn't move ${insight.insight_id} to Ready for QA: ${msg}`);
    } finally {
      setSubmittingStatus(false);
    }
  };

  return (
    <TableRow hover selected={selected}>
      <TableCell padding="checkbox">
        <Checkbox size="small" checked={selected} onChange={() => onToggleSelect(insight.id)} />
      </TableCell>
      <TableCell>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <span>{values.insight_id}</span>
          {role !== "utility" && (
            <Tooltip title="Open full editor">
              <IconButton size="small" onClick={() => onOpen(insight.id)}>
                <OpenInNewIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </TableCell>
      <TableCell>{values.appliance}</TableCell>
      <TableCell>{values.fuel_type}</TableCell>
      {fields.map((f) => (
        <TableCell key={f} sx={{ verticalAlign: "top" }}>
          <EditableCell
            value={values[f] ?? ""}
            editable={isEditable(f)}
            limit={INSIGHT_CHAR_LIMITS[f]}
            dirty={f in dirty}
            onChange={(v) => onChange(f, v)}
          />
        </TableCell>
      ))}
      <TableCell>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title={overLimit ? "Over the character limit — fix before changing status" : ""}>
            <span>
              <Select
                size="small" variant="standard" disableUnderline value={values.status}
                disabled={submittingStatus || overLimit} onChange={(e) => changeStatus(e.target.value)}
                renderValue={(v) => <Chip size="small" label={String(v).replace(/_/g, " ")} color={statusColor[v as string]} />}
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="draft" disabled={values.status !== "draft"}>Draft</MenuItem>
                <MenuItem value="ready_for_qa" disabled={values.status !== "ready_for_qa" && !canSubmit}>Ready for QA</MenuItem>
                <MenuItem value="published" disabled={values.status !== "published"}>Published</MenuItem>
                <MenuItem value="modified" disabled={values.status !== "modified"}>Modified</MenuItem>
              </Select>
            </span>
          </Tooltip>
          {role === "admin" && values.merged && <Chip size="small" label="merged" variant="outlined" />}
        </Stack>
      </TableCell>
      <TableCell>
        {canUnlock ? (
          <Tooltip title="Unlock to edit (moves to Modified)">
            <IconButton size="small" color="warning" onClick={unlock}>
              <LockOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title={overLimit ? "Over the character limit — fix before saving" : ""}>
            <span>
              <IconButton size="small" color="primary" disabled={!Object.keys(dirty).length || saving || overLimit} onClick={save}>
                <SaveIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {canDelete && (
          <IconButton size="small" onClick={() => onDelete(values)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  );
});

export default function InsightsList() {
  const navigate = useNavigate();
  const { role } = useRole();
  const permissions = usePermissions("insight");
  const { pilotId } = usePilot();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<Channel>("email");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Insight | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const load = () => { if (pilotId) api.listInsights(pilotId).then(setInsights); };
  useEffect(load, [pilotId]);

  const onSaved = (id: number, fields: Record<string, string>) => {
    const prev = insights.find((i) => i.id === id);
    const revertedToDraft = fields.status === "draft" && prev?.status === "ready_for_qa";
    setInsights((rows) => rows.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    setSavedMsg(revertedToDraft
      ? `Saved ${prev?.insight_id ?? id} — reverted to Draft (was Ready for QA)`
      : `Saved ${prev?.insight_id ?? id}`);
  };

  const onUnlocked = (id: number) => {
    setInsights((rows) => rows.map((r) => (r.id === id ? { ...r, status: "modified" } : r)));
    setSavedMsg(`Unlocked ${insights.find((i) => i.id === id)?.insight_id ?? id} — now Modified`);
  };

  const onSubmitted = (id: number) => {
    setInsights((rows) => rows.map((r) => (r.id === id ? { ...r, status: "ready_for_qa" } : r)));
    setSavedMsg(`${insights.find((i) => i.id === id)?.insight_id ?? id} moved to Ready for QA`);
  };

  const toggleSelect = (id: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((s) => (filtered.every((i) => s.has(i.id)) ? new Set() : new Set(filtered.map((i) => i.id))));
  };

  const submitSelected = async () => {
    setBulkSubmitting(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => api.submitInsight(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    setBulkSubmitting(false);
    load();
    if (failed) setErrorMsg(`${ids.length - failed}/${ids.length} moved to Ready for QA — ${failed} failed validation`);
    else setSavedMsg(`${ids.length} insight(s) moved to Ready for QA`);
  };

  const publishSelected = async () => {
    if (!pilotId) return;
    const ids = [...selected];
    const eligible = ids.filter((id) => insights.find((i) => i.id === id)?.status === "ready_for_qa");
    const skippedUpfront = ids.length - eligible.length;
    if (eligible.length === 0) {
      setErrorMsg("None of the selected rows are Ready for QA — nothing to publish.");
      return;
    }
    setPublishing(true);
    try {
      const res = await api.publishInsights(pilotId, eligible);
      downloadCsv(res.filename, res.csv);
      setSelected(new Set());
      load();
      const skippedTotal = skippedUpfront + res.skipped_ids.length;
      setSavedMsg(`Published ${res.published_ids.length} insight(s)${skippedTotal ? ` — ${skippedTotal} skipped (not Ready for QA)` : ""}`);
    } catch (e: any) {
      setErrorMsg(`Couldn't publish: ${String(e.message)}`);
    } finally {
      setPublishing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteInsight(deleteTarget.id);
      setInsights((rows) => rows.filter((r) => r.id !== deleteTarget.id));
      setSavedMsg(`Deleted ${deleteTarget.insight_id}`);
    } catch (e: any) {
      setErrorMsg(`Couldn't delete ${deleteTarget.insight_id}: ${String(e.message)}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  const downloadSheet = async (statuses: string[]) => {
    if (!pilotId) return;
    const res = await api.exportInsightsSheet(pilotId, statuses);
    downloadCsv(res.filename, res.csv);
  };

  const filtered = insights
    .filter((i) => statusFilter === "all" || i.status === statusFilter)
    .filter((i) => `${i.insight_id} ${i.appliance} ${i.insight_semantic}`.toLowerCase().includes(filter.toLowerCase()));

  const fields = FIELDS_BY_CHANNEL[channel].filter((f) => permissions[f] !== "none");
  const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const someVisibleSelected = filtered.some((i) => selected.has(i.id));

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Insights ({insights.length})</Typography>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <TextField
          size="small" label="Filter" value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ maxWidth: 320 }}
        />
        <ToggleButtonGroup
          size="small" value={statusFilter} exclusive
          onChange={(_, v: StatusFilter | null) => v && setStatusFilter(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="draft">Draft</ToggleButton>
          <ToggleButton value="ready_for_qa">Ready for QA</ToggleButton>
          <ToggleButton value="published">Published</ToggleButton>
          <ToggleButton value="modified">Modified</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small" value={channel} exclusive
          onChange={(_, v: Channel | null) => v && setChannel(v)}
        >
          <ToggleButton value="email">Email / Web (2 fields)</ToggleButton>
          <ToggleButton value="paper">Paper (2 fields)</ToggleButton>
        </ToggleButtonGroup>
        {role === "admin" && (
          <Button size="small" variant="outlined" onClick={() => setDownloadOpen(true)}>
            Download Sheet
          </Button>
        )}
        {selected.size > 0 && (
          <>
            <Button size="small" variant="contained" disabled={bulkSubmitting} onClick={submitSelected}>
              Move to Ready for QA ({selected.size})
            </Button>
            {role === "admin" && (
              <Button size="small" variant="contained" color="success" disabled={publishing} onClick={publishSelected}>
                Publish Selected ({selected.size})
              </Button>
            )}
          </>
        )}
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small" sx={{ minWidth: 1000 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Tooltip title="Select all — content edits are disabled for selected rows while you move their status in bulk">
                  <Checkbox
                    size="small" checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    onChange={toggleSelectAll}
                  />
                </Tooltip>
              </TableCell>
              <TableCell>Insight ID</TableCell>
              <TableCell>Appliance</TableCell>
              <TableCell>Fuel</TableCell>
              {fields.map((f) => (
                <TableCell key={f}>
                  {f.replace(/_/g, " ")}
                  {INSIGHT_CHAR_LIMITS[f] ? ` (≤${INSIGHT_CHAR_LIMITS[f]})` : ""}
                </TableCell>
              ))}
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((i) => (
              <InsightRow key={i.id} insight={i} role={role} permissions={permissions} fields={fields} selected={selected.has(i.id)}
                onOpen={(id) => navigate(`/insights/${id}`)} onSaved={onSaved} onError={setErrorMsg}
                onToggleSelect={toggleSelect} onDelete={setDeleteTarget} onUnlocked={onUnlocked} onSubmitted={onSubmitted} />
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={fields.length + 5}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                    {insights.length === 0 ? "No insights in this pilot yet." : "No insights match your filter."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Snackbar open={!!savedMsg} autoHideDuration={2500} onClose={() => setSavedMsg(null)} message={savedMsg} />
      <Snackbar open={!!errorMsg} autoHideDuration={4000} onClose={() => setErrorMsg(null)}>
        <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete insight {deleteTarget?.insight_id}? This can't be undone.</DialogTitle>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
      <DownloadSheetDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} onDownload={downloadSheet} />
    </Stack>
  );
}
