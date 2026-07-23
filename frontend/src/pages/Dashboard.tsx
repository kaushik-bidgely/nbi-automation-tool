import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Stack, Typography, Grid, Card, CardActionArea, Box,
  LinearProgress, Chip, Avatar, Divider, Button,
} from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import HistoryIcon from "@mui/icons-material/History";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { usePilot } from "../PilotContext";

type Row = Record<string, any>;

const STATUS_ORDER = ["draft", "ready_for_qa", "published", "modified"] as const;
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", ready_for_qa: "Ready for QA", published: "Published", modified: "Modified",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "#9ca3af", ready_for_qa: "#d97706", published: "#059669", modified: "#2563eb",
};

function counts(rows: Row[]) {
  const c: Record<string, number> = { draft: 0, ready_for_qa: 0, published: 0, modified: 0 };
  for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}

function StatusBreakdown({ rows }: { rows: Row[] }) {
  const total = rows.length || 1;
  const c = counts(rows);
  return (
    <Stack spacing={1}>
      <Box sx={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", bgcolor: "grey.100" }}>
        {STATUS_ORDER.map((s) => (
          c[s] > 0 && <Box key={s} sx={{ width: `${(c[s] / total) * 100}%`, bgcolor: STATUS_COLOR[s] }} />
        ))}
      </Box>
      <Stack direction="row" spacing={1.5} flexWrap="wrap">
        {STATUS_ORDER.map((s) => (
          <Stack key={s} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: STATUS_COLOR[s] }} />
            <Typography variant="caption" color="text.secondary">{STATUS_LABEL[s]} {c[s]}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function ContentCard({
  title, icon, to, rows, merged,
}: { title: string; icon: React.ReactNode; to: string; rows: Row[]; merged: number }) {
  return (
    <Card>
      <CardActionArea component={Link} to={to} sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36 }}>{icon}</Avatar>
              <Box>
                <Typography variant="subtitle1">{title}</Typography>
                <Typography variant="h5">{rows.length}</Typography>
              </Box>
            </Stack>
            <ArrowForwardIcon fontSize="small" color="disabled" />
          </Stack>
          <StatusBreakdown rows={rows} />
          {merged > 0 && (
            <Chip size="small" variant="outlined" label={`${merged} merged with a pairing`} sx={{ alignSelf: "flex-start" }} />
          )}
        </Stack>
      </CardActionArea>
    </Card>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Card sx={{ flex: 1, minWidth: 160 }}>
      <CardActionArea component={Link} to={to} sx={{ p: 2 }}>
        <Stack spacing={1} alignItems="flex-start">
          <Avatar sx={{ bgcolor: "grey.100", color: "text.primary", width: 32, height: 32 }}>{icon}</Avatar>
          <Typography variant="subtitle2" sx={{ color: "text.primary" }}>{label}</Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const role = user!.role;
  const { pilotId, pilots } = usePilot();
  const [actions, setActions] = useState<Row[]>([]);
  const [insights, setInsights] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  const showActions = role !== "utility" || user!.content_scope !== "insights";
  const showInsights = role !== "utility" || user!.content_scope !== "actions";
  const pilot = pilots.find((p) => p.id === pilotId);

  useEffect(() => {
    if (!pilotId) return;
    setLoaded(false);
    Promise.allSettled([
      showActions ? api.listActions(pilotId) : Promise.resolve([]),
      showInsights ? api.listInsights(pilotId) : Promise.resolve([]),
      role !== "utility" ? api.auditLog() : Promise.resolve([]),
    ]).then(([a, i, l]) => {
      setActions(a.status === "fulfilled" ? a.value : []);
      setInsights(i.status === "fulfilled" ? i.value : []);
      setAudit(l.status === "fulfilled" ? l.value.slice(0, 8) : []);
      setLoaded(true);
    });
  }, [pilotId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <LinearProgress sx={{ maxWidth: 400 }} />;

  const mergedActions = actions.filter((a) => a.merged).length;
  const mergedInsights = insights.filter((i) => i.merged).length;

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4">Dashboard</Typography>
        <Typography variant="body1" color="text.secondary">
          {pilot ? `${pilot.name} (${pilot.code})` : "Select a pilot"} — overview of where content stands.
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        {showActions && (
          <Grid size={{ xs: 12, md: 6 }}>
            <ContentCard
              title="Actions" icon={<DescriptionOutlinedIcon fontSize="small" />}
              to="/actions" rows={actions} merged={mergedActions}
            />
          </Grid>
        )}
        {showInsights && (
          <Grid size={{ xs: 12, md: 6 }}>
            <ContentCard
              title="Insights" icon={<LightbulbOutlinedIcon fontSize="small" />}
              to="/insights" rows={insights} merged={mergedInsights}
            />
          </Grid>
        )}
      </Grid>

      {role !== "utility" && (
        <Stack spacing={2}>
          <Typography variant="subtitle2">Quick links</Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            {role === "admin" && (
              <QuickLink to="/interactions" icon={<CallMergeIcon fontSize="small" />} label="Interactions" />
            )}
            <QuickLink to="/audit-log" icon={<HistoryIcon fontSize="small" />} label="Audit Log" />
            {role === "admin" && <QuickLink to="/users" icon={<GroupOutlinedIcon fontSize="small" />} label="Manage Users" />}
          </Stack>
        </Stack>
      )}

      {role !== "utility" && (
        <Stack spacing={1.5}>
          <Typography variant="subtitle2">Recent activity</Typography>
          <Card>
            {audit.length === 0 ? (
              <Box sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">No changes recorded yet.</Typography>
              </Box>
            ) : (
              <Stack divider={<Divider />}>
                {audit.map((a) => (
                  <Box key={a.id} sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Typography variant="body2">
                      <strong>{a.changed_by_role}</strong> changed <strong>{a.field}</strong> on {a.entity_type.replace("_item", "")} #{a.entity_id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {new Date(a.changed_at).toLocaleString()}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
            <Divider />
            <Box sx={{ p: 1.5, textAlign: "right" }}>
              <Button component={Link} to="/audit-log" size="small">View full audit log</Button>
            </Box>
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
