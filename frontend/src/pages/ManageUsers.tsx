import { useEffect, useState } from "react";
import {
  Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, RadioGroup, FormControlLabel, Radio, Checkbox, OutlinedInput,
  Chip, IconButton, Alert, Snackbar,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { api } from "../api";
import { usePilot } from "../PilotContext";

type User = {
  id: number; username: string; role: string;
  allowed_pilot_ids: number[]; content_scope: string; channel_scope: string;
};

// Shared by Create and Edit — Edit just pre-fills from `existingUser` and
// makes password optional (blank = leave unchanged) and username read-only.
function UserFormDialog({
  open, onClose, onSaved, existingUser,
}: { open: boolean; onClose: () => void; onSaved: () => void; existingUser?: User }) {
  const { pilots } = usePilot();
  const nonMaster = pilots.filter((p) => !p.is_master);
  const isEdit = !!existingUser;

  const [username, setUsername] = useState(existingUser?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(existingUser?.role ?? "tpm_csm");
  const [pilotIds, setPilotIds] = useState<number[]>(existingUser?.allowed_pilot_ids ?? []);
  const [contentScope, setContentScope] = useState(existingUser?.content_scope ?? "both");
  const [channelScope, setChannelScope] = useState(existingUser?.channel_scope ?? "both");
  const [error, setError] = useState<string | null>(null);

  // Re-sync whenever a different user is opened for editing (or dialog reopens for create).
  useEffect(() => {
    setUsername(existingUser?.username ?? "");
    setPassword("");
    setRole(existingUser?.role ?? "tpm_csm");
    setPilotIds(existingUser?.allowed_pilot_ids ?? []);
    setContentScope(existingUser?.content_scope ?? "both");
    setChannelScope(existingUser?.channel_scope ?? "both");
    setError(null);
  }, [existingUser, open]);

  const submit = async () => {
    setError(null);
    try {
      if (isEdit) {
        const body: Record<string, unknown> = {
          role,
          allowed_pilot_ids: role === "utility" ? pilotIds : [],
          content_scope: contentScope, channel_scope: channelScope,
        };
        if (password) body.password = password;
        await api.updateUser(existingUser!.id, body);
      } else {
        await api.createUser({
          username, password, role,
          allowed_pilot_ids: role === "utility" ? pilotIds : [],
          content_scope: contentScope, channel_scope: channelScope,
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(String(e.message));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit ${existingUser!.username}` : "Create User"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)}
            size="small" fullWidth disabled={isEdit} helperText={isEdit ? "Username can't be changed" : undefined} />
          <TextField label={isEdit ? "New password (leave blank to keep current)" : "Password"} type="password"
            value={password} onChange={(e) => setPassword(e.target.value)} size="small" fullWidth />

          <FormControl size="small" fullWidth>
            <InputLabel>Role</InputLabel>
            <Select value={role} label="Role" onChange={(e) => setRole(e.target.value)}>
              <MenuItem value="admin">Admin (Delivery — full access)</MenuItem>
              <MenuItem value="tpm_csm">TPM / CSM (content editor)</MenuItem>
              <MenuItem value="utility">Utility (external, read-only, scoped)</MenuItem>
            </Select>
          </FormControl>

          {role === "utility" && (
            <>
              <FormControl size="small" fullWidth>
                <InputLabel>Pilots this account can see</InputLabel>
                <Select
                  multiple value={pilotIds} input={<OutlinedInput label="Pilots this account can see" />}
                  onChange={(e) => setPilotIds(e.target.value as any)}
                  renderValue={(sel) => (sel as number[]).map((id) => nonMaster.find((p) => p.id === id)?.name ?? id).join(", ")}
                >
                  {nonMaster.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      <Checkbox checked={pilotIds.includes(p.id)} size="small" />
                      {p.name} ({p.code})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Typography variant="subtitle2">Content visible to this account</Typography>
              <RadioGroup row value={contentScope} onChange={(e) => setContentScope(e.target.value)}>
                <FormControlLabel value="actions" control={<Radio size="small" />} label="Actions only" />
                <FormControlLabel value="insights" control={<Radio size="small" />} label="Insights only" />
                <FormControlLabel value="both" control={<Radio size="small" />} label="Both" />
              </RadioGroup>

              <Typography variant="subtitle2">Channel visible to this account</Typography>
              <RadioGroup row value={channelScope} onChange={(e) => setChannelScope(e.target.value)}>
                <FormControlLabel value="email" control={<Radio size="small" />} label="Email / Web only" />
                <FormControlLabel value="paper" control={<Radio size="small" />} label="Paper only" />
                <FormControlLabel value="both" control={<Radio size="small" />} label="Both" />
              </RadioGroup>
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!username || (!isEdit && !password)} onClick={submit}>
          {isEdit ? "Save Changes" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ManageUsers() {
  const { pilots } = usePilot();
  const [users, setUsers] = useState<User[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = () => api.listUsers().then(setUsers);
  useEffect(() => { load(); }, []);

  const pilotName = (id: number) => pilots.find((p) => p.id === id)?.name ?? id;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteUser(deleteTarget.id);
      load();
    } catch (e: any) {
      setErrorMsg(String(e.message));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Users ({users.length})</Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>Create User</Button>
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Username</TableCell><TableCell>Role</TableCell>
              <TableCell>Pilots</TableCell><TableCell>Content</TableCell><TableCell>Channel</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.username}</TableCell>
                <TableCell><Chip size="small" label={u.role} /></TableCell>
                <TableCell>{u.role === "utility" ? u.allowed_pilot_ids.map(pilotName).join(", ") || "—" : "all"}</TableCell>
                <TableCell>{u.role === "utility" ? u.content_scope : "—"}</TableCell>
                <TableCell>{u.role === "utility" ? u.channel_scope : "—"}</TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => setEditUser(u)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDeleteTarget(u)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <UserFormDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />
      <UserFormDialog open={!!editUser} onClose={() => setEditUser(null)} onSaved={load} existingUser={editUser ?? undefined} />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete user "{deleteTarget?.username}"? This can't be undone.</DialogTitle>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!errorMsg} autoHideDuration={4000} onClose={() => setErrorMsg(null)}>
        <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
    </Stack>
  );
}
