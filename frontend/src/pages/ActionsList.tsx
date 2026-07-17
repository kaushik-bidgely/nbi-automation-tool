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
import { ACTION_EMAIL_FIELDS, ACTION_PAPER_TABLE_FIELDS, ACTION_CHAR_LIMITS } from "../fieldGroups";
import { downloadCsv } from "../downloadCsv";

type Action = Record<string, any>;
type Channel = "email" | "paper";
type StatusFilter = "all" | "draft" | "ready_for_qa" | "published" | "modified";

const statusColor: Record<string, "default" | "warning" | "success" | "info"> = {
  draft: "default", ready_for_qa: "warning", published: "success", modified: "info",
};

const FIELDS_BY_CHANNEL: Record<Channel, readonly string[]> = {
  email: ACTION_EMAIL_FIELDS,
  paper: ACTION_PAPER_TABLE_FIELDS,
};

// Each row owns its own edit state, so typing in one row only re-renders that
// row — not the whole table. Previously all 173 rows lived in one array in
// the parent's state, so every keystroke re-rendered ~1000 MUI TextFields
// (~750ms per keystroke). This is the fix for that.
const ActionRow = memo(function ActionRow({
  action, role, permissions, fields, selected, onOpen, onSaved, onError, onToggleSelect, onDelete, onUnlocked, onSubmitted,
}: {
  action: Action; role: string; permissions: PermissionMap; fields: readonly string[]; selected: boolean;
  onOpen: (id: number) => void; onSaved: (id: number, fields: Record<string, string>) => void;
  onError: (msg: string) => void; onToggleSelect: (id: number) => void; onDelete: (action: Action) => void;
  onUnlocked: (id: number) => void; onSubmitted: (id: number) => void;
}) {
  const [values, setValues] = useState(action);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // `action` is a fresh object every time the parent reloads (bulk submit,
  // another row's edit, etc.) — resync anything the user isn't actively
  // editing so this row can't get stuck showing stale data (e.g. a status
  // change from elsewhere) after the initial mount. Fields with unsaved
  // local edits (`dirty`) are deliberately preserved rather than clobbered.
  useEffect(() => {
    setValues((v) => {
      const merged = { ...action };
      for (const key of Object.keys(dirty)) merged[key] = v[key];
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when the server-side `action` prop changes, not on every keystroke into `dirty`
  }, [action]);

  const locked = values.status === "published";
  const isEditable = (field: string) => !locked && permissions[field] === "edit";
  const canDelete = role === "admin" || (role === "tpm_csm" && values.status === "draft");
  const canUnlock = locked && (role === "admin" || role === "tpm_csm");
  const canSubmit = values.status === "draft" || values.status === "modified";

  const onChange = (field: string, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setDirty((d) => ({ ...d, [field]: value }));
  };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const updated = await api.updateAction(action.id, dirty);
      onSaved(action.id, { ...dirty, status: updated.status });
      setDirty({});
    } catch (e: any) {
      onError(`Couldn't save ${action.action_id}: ${String(e.message)}`);
    } finally {
      setSaving(false);
    }
  };

  const unlock = async () => {
    try {
      await api.unlockAction(action.id);
      onUnlocked(action.id);
    } catch (e: any) {
      onError(`Couldn't unlock ${action.action_id}: ${String(e.message)}`);
    }
  };

  const changeStatus = async (newStatus: string) => {
    if (newStatus === values.status || newStatus !== "ready_for_qa" || !canSubmit) return;
    setSubmittingStatus(true);
    try {
      await api.submitAction(action.id);
      onSubmitted(action.id);
    } catch (e: any) {
      let msg = String(e.message);
      try {
        const parsed = JSON.parse(e.message);
        if (Array.isArray(parsed.issues)) msg = parsed.issues.join(", ");
      } catch { /* not a validation-issues payload — use the raw message */ }
      onError(`Couldn't move ${action.action_id} to Ready for QA: ${msg}`);
    } finally {
      setSubmittingStatus(false);
    }
  };

  return (
    <TableRow hover selected={selected}>
      <TableCell padding="checkbox">
        <Checkbox size="small" checked={selected} onChange={() => onToggleSelect(action.id)} />
      </TableCell>
      <TableCell>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <span>{values.action_id}</span>
          <Tooltip title="Open full editor">
            <IconButton size="small" onClick={() => onOpen(action.id)}>
              <OpenInNewIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
      <TableCell>{values.appliance}</TableCell>
      {fields.map((f) => (
        <TableCell key={f} sx={{ verticalAlign: "top" }}>
          <EditableCell
            value={values[f] ?? ""}
            editable={isEditable(f)}
            limit={ACTION_CHAR_LIMITS[f]}
            onChange={(v) => onChange(f, v)}
          />
        </TableCell>
      ))}
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
          {values.merged && <Chip size="small" label="merged" variant="outlined" />}
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
          <IconButton size="small" color="primary" disabled={!Object.keys(dirty).length || saving} onClick={save}>
            <SaveIcon fontSize="small" />
          </IconButton>
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

export default function ActionsList() {
  const navigate = useNavigate();
  const { role } = useRole();
  const permissions = usePermissions("action");
  const { pilotId } = usePilot();
  const [actions, setActions] = useState<Action[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<Channel>("email");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Action | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = () => { if (pilotId) api.listActions(pilotId).then(setActions); };
  useEffect(load, [pilotId]);

  const onSaved = (id: number, fields: Record<string, string>) => {
    const prev = actions.find((a) => a.id === id);
    const revertedToDraft = fields.status === "draft" && prev?.status === "ready_for_qa";
    setActions((rows) => rows.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    setSavedMsg(revertedToDraft
      ? `Saved ${prev?.action_id ?? id} — reverted to Draft (was Ready for QA)`
      : `Saved ${prev?.action_id ?? id}`);
  };

  const onUnlocked = (id: number) => {
    setActions((rows) => rows.map((r) => (r.id === id ? { ...r, status: "modified" } : r)));
    setSavedMsg(`Unlocked ${actions.find((a) => a.id === id)?.action_id ?? id} — now Modified`);
  };

  const onSubmitted = (id: number) => {
    setActions((rows) => rows.map((r) => (r.id === id ? { ...r, status: "ready_for_qa" } : r)));
    setSavedMsg(`${actions.find((a) => a.id === id)?.action_id ?? id} moved to Ready for QA`);
  };

  const toggleSelect = (id: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submitSelected = async () => {
    setBulkSubmitting(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => api.submitAction(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    setBulkSubmitting(false);
    load();
    if (failed) setErrorMsg(`${ids.length - failed}/${ids.length} moved to Ready for QA — ${failed} failed validation`);
    else setSavedMsg(`${ids.length} action(s) moved to Ready for QA`);
  };

  const publishSelected = async () => {
    if (!pilotId) return;
    const ids = [...selected];
    const eligible = ids.filter((id) => actions.find((a) => a.id === id)?.status === "ready_for_qa");
    const skippedUpfront = ids.length - eligible.length;
    if (eligible.length === 0) {
      setErrorMsg("None of the selected rows are Ready for QA — nothing to publish.");
      return;
    }
    setPublishing(true);
    try {
      const res = await api.publishActions(pilotId, eligible);
      downloadCsv(res.filename, res.csv);
      setSelected(new Set());
      load();
      const skippedTotal = skippedUpfront + res.skipped_ids.length;
      setSavedMsg(`Published ${res.published_ids.length} action(s)${skippedTotal ? ` — ${skippedTotal} skipped (not Ready for QA)` : ""}`);
    } catch (e: any) {
      setErrorMsg(`Couldn't publish: ${String(e.message)}`);
    } finally {
      setPublishing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteAction(deleteTarget.id);
      setActions((rows) => rows.filter((r) => r.id !== deleteTarget.id));
      setSavedMsg(`Deleted ${deleteTarget.action_id}`);
    } catch (e: any) {
      setErrorMsg(`Couldn't delete ${deleteTarget.action_id}: ${String(e.message)}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  const exportSheet = async () => {
    if (!pilotId) return;
    setExporting(true);
    try {
      const res = await api.exportActionsSheet(pilotId);
      downloadCsv(res.filename, res.csv);
    } catch (e: any) {
      setErrorMsg(`Couldn't export: ${String(e.message)}`);
    } finally {
      setExporting(false);
    }
  };

  const filtered = actions
    .filter((a) => statusFilter === "all" || a.status === statusFilter)
    .filter((a) => `${a.action_id} ${a.title} ${a.appliance}`.toLowerCase().includes(filter.toLowerCase()));

  const fields = FIELDS_BY_CHANNEL[channel].filter((f) => permissions[f] !== "none");

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Actions ({actions.length})</Typography>
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
          <ToggleButton value="email">Email / Web (3 fields)</ToggleButton>
          <ToggleButton value="paper">Paper (2 fields)</ToggleButton>
        </ToggleButtonGroup>
        {role === "admin" && (
          <Button size="small" variant="outlined" disabled={exporting} onClick={exportSheet}>
            Download Sheet (Ready for QA+)
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
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Action ID</TableCell>
              <TableCell>Appliance</TableCell>
              {fields.map((f) => (
                <TableCell key={f}>
                  {f.replace(/_/g, " ")}
                  {ACTION_CHAR_LIMITS[f] ? ` (≤${ACTION_CHAR_LIMITS[f]})` : ""}
                </TableCell>
              ))}
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((a) => (
              <ActionRow key={a.id} action={a} role={role} permissions={permissions} fields={fields} selected={selected.has(a.id)}
                onOpen={(id) => navigate(`/actions/${id}`)} onSaved={onSaved} onError={setErrorMsg}
                onToggleSelect={toggleSelect} onDelete={setDeleteTarget} onUnlocked={onUnlocked} onSubmitted={onSubmitted} />
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={fields.length + 4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                    {actions.length === 0 ? "No actions in this pilot yet." : "No actions match your filter."}
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
        <DialogTitle>Delete action {deleteTarget?.action_id}? This can't be undone.</DialogTitle>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
