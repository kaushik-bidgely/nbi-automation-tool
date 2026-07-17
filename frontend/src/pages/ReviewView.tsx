import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Paper, Stack, Typography, Button, Divider, Alert } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api } from "../api";

export default function ReviewView({ kind }: { kind: "action" | "insight" }) {
  const { id } = useParams();
  const [data, setData] = useState<Record<string, string | null> | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setNotFound(false);
    const fn = kind === "action" ? api.reviewAction : api.reviewInsight;
    fn(Number(id)).then(setData).catch(() => setNotFound(true));
  }, [id, kind]);

  if (notFound) {
    return (
      <Stack spacing={2} alignItems="flex-start">
        <Alert severity="warning">{kind === "action" ? "Action" : "Insight"} #{id} doesn't exist.</Alert>
        <Button component={Link} to={kind === "action" ? "/actions" : "/insights"} startIcon={<ArrowBackIcon />}>
          Back to {kind === "action" ? "Actions" : "Insights"}
        </Button>
      </Stack>
    );
  }
  if (!data) return <Typography>Loading…</Typography>;

  return (
    <Stack spacing={2} sx={{ maxWidth: 600 }}>
      <Typography variant="h5">Utility Review — {kind === "action" ? data.action_id : data.insight_id}</Typography>
      <Typography variant="body2" color="text.secondary">
        This is the auto-generated view a customer/utility sees — only the fields already
        defined as reviewable are shown. Everything else (identity, filters, tag string) is
        never exposed here. Closes gap G2 from Old NBIs Process.md.
      </Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5} divider={<Divider />}>
          {Object.entries(data)
            .filter(([k]) => !k.endsWith("_id"))
            .map(([k, v]) => (
              <Stack key={k}>
                <Typography variant="caption" color="text.secondary">{k}</Typography>
                <Typography>{v || <em>empty</em>}</Typography>
              </Stack>
            ))}
        </Stack>
      </Paper>
      <Button component={Link} to={kind === "action" ? `/actions/${id}` : `/insights/${id}`}>
        Back to editor
      </Button>
    </Stack>
  );
}
