import { useState } from "react";
import {
  AppBar, Toolbar, Typography, Button, Container, Box, Select, MenuItem,
  Chip, CircularProgress, Tooltip, IconButton, Dialog, DialogTitle, DialogActions, Alert, Snackbar, Stack,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { Routes, Route, Link } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { PilotProvider, usePilot } from "./PilotContext";
import Login from "./Login";
import ActionsList from "./pages/ActionsList";
import ActionEditor from "./pages/ActionEditor";
import InsightsList from "./pages/InsightsList";
import InsightEditor from "./pages/InsightEditor";
import ReviewView from "./pages/ReviewView";
import InteractionsView from "./pages/InteractionsView";
import AuditLog from "./pages/AuditLog";
import ManageUsers from "./pages/ManageUsers";
import PilotsAdmin from "./pages/PilotsAdmin";
import SchemaReference from "./pages/SchemaReference";
import Dashboard from "./pages/Dashboard";

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const { pilotId, pilots, setPilotId, refreshPilots } = usePilot();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const role = user!.role;

  const selectablePilots = pilots.filter((p) => !p.is_master);
  const currentPilot = selectablePilots.find((p) => p.id === pilotId);
  // Admin always sees all 3 tabs, even with zero rows — otherwise there'd be
  // no way to discover an empty pilot needs content, or to reach Interactions
  // at all to create the first one (Merge All / upload) from its Actions/
  // Insights. tpm_csm/utility still only see a tab once it has something in it.
  const showActions = role === "admin"
    || ((role !== "utility" || user!.content_scope !== "insights") && (currentPilot?.action_count ?? 0) > 0);
  const showInsights = role === "admin"
    || ((role !== "utility" || user!.content_scope !== "actions") && (currentPilot?.insight_count ?? 0) > 0);
  const showInteractions = role === "admin";

  const deletePilot = async () => {
    if (!pilotId) return;
    try {
      await api.deletePilot(pilotId);
      // The deleted id won't be in the refreshed list, so PilotContext's own
      // fallback logic picks a new valid pilot automatically.
      refreshPilots();
    } catch (e: any) {
      setErrorMsg(String(e.message));
    } finally {
      setDeleteConfirm(false);
    }
  };

  return (
    <Box>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1.5, flexWrap: "wrap", rowGap: 1, py: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 0, whiteSpace: "nowrap" }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: 1.5, bgcolor: "primary.main",
              color: "primary.contrastText", display: "flex", alignItems: "center",
              justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0,
            }}>
              N
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>NBI Automation</Typography>
          </Stack>
          <Select
            size="small" value={pilotId ?? ""} displayEmpty sx={{ minWidth: 180 }}
            onChange={(e) => setPilotId(Number(e.target.value))}
          >
            {selectablePilots.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name} ({p.code})</MenuItem>
            ))}
          </Select>
          {role === "admin" && currentPilot && (
            <Tooltip title={`Delete ${currentPilot.name}`}>
              <IconButton size="small" onClick={() => setDeleteConfirm(true)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Button component={Link} to="/">Dashboard</Button>
          {showActions && <Button component={Link} to="/actions">Actions</Button>}
          {showInsights && <Button component={Link} to="/insights">Insights</Button>}
          {showInteractions && <Button component={Link} to="/interactions">Interactions</Button>}
          {role !== "utility" && <Button component={Link} to="/audit-log">Audit Log</Button>}
          {role === "admin" && <Button component={Link} to="/users">Users</Button>}
          {role === "admin" && <Button component={Link} to="/pilots">Pilots</Button>}
          {role === "admin" && <Button component={Link} to="/schema">Schema</Button>}
          <Chip size="small" label={`${user!.username} · ${role}`} sx={{ whiteSpace: "nowrap" }} />
          <Button size="small" onClick={logout}>Logout</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} sx={{ py: 4 }}>
        {pilotId && (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/actions" element={<ActionsList />} />
            <Route path="/insights" element={<InsightsList />} />
            {role !== "utility" && <Route path="/actions/:id" element={<ActionEditor />} />}
            {role !== "utility" && <Route path="/actions/:id/review" element={<ReviewView kind="action" />} />}
            {role !== "utility" && <Route path="/insights/:id" element={<InsightEditor />} />}
            {role !== "utility" && <Route path="/insights/:id/review" element={<ReviewView kind="insight" />} />}
            {role === "admin" && <Route path="/interactions" element={<InteractionsView />} />}
            {role !== "utility" && <Route path="/audit-log" element={<AuditLog />} />}
            {role === "admin" && <Route path="/users" element={<ManageUsers />} />}
            {role === "admin" && <Route path="/pilots" element={<PilotsAdmin />} />}
            {role === "admin" && <Route path="/schema" element={<SchemaReference />} />}
          </Routes>
        )}
      </Container>
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
        <DialogTitle>Delete pilot "{currentPilot?.name}"? This deletes all its actions, insights, and interactions — can't be undone.</DialogTitle>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button color="error" onClick={deletePilot}>Delete Pilot</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!errorMsg} autoHideDuration={4000} onClose={() => setErrorMsg(null)}>
        <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
    </Box>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}><CircularProgress /></Box>;
  }
  if (!user) {
    return <Login />;
  }
  return (
    // Keyed by user id so switching accounts (via the test-account switcher or
    // a real re-login) forces a clean remount of pilot state instead of
    // showing the previous account's pilot list/selection.
    <PilotProvider key={user.id}>
      <AuthenticatedApp />
    </PilotProvider>
  );
}
