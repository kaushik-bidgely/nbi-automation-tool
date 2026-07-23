import { useEffect, useMemo, useState } from "react";
import {
  Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper,
  TextField, Tabs, Tab, Chip, Tooltip, CircularProgress,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { api } from "../api";

type FieldSchemaEntry = {
  field: string;
  category: string;
  channel: string | null;
  description: string;
  type: string;
  list_valued: boolean;
  accepted_values: Record<string, string> | null;
  char_limit: number | null;
  required_for_submit: boolean;
  shown_in_ui: boolean;
};

type Schema = { actions: FieldSchemaEntry[]; insights: FieldSchemaEntry[]; interactions: FieldSchemaEntry[] };
type TabKey = "actions" | "insights" | "interactions";

const categoryColor: Record<string, "primary" | "secondary" | "default" | "success"> = {
  content: "primary", image: "secondary", internal: "default", generated: "success",
};

// Read-only — pulled live from GET /api/schema, itself assembled live from
// rbac_matrix.py/tag_logic.py/sheet_export.py/validation.py/models.py, so
// this page can never show a vocab that's drifted from the real code.
function AcceptedValuesCell({ entry }: { entry: FieldSchemaEntry }) {
  if (!entry.accepted_values) {
    if (entry.type === "boolean") {
      return <Typography variant="caption" color="text.secondary">true / false</Typography>;
    }
    if (entry.type === "integer") {
      return <Typography variant="caption" color="text.secondary">Numeric — no fixed values</Typography>;
    }
    return <Typography variant="caption" color="text.disabled" fontStyle="italic">Free text — no vocab enforced</Typography>;
  }
  return (
    <Stack spacing={0.5}>
      {entry.list_valued && <Typography variant="caption" color="text.secondary">Any subset of:</Typography>}
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
        {Object.entries(entry.accepted_values).map(([code, label]) => (
          <Tooltip key={code} title={label}>
            <Chip size="small" label={code} variant={entry.list_valued ? "outlined" : "filled"} />
          </Tooltip>
        ))}
      </Stack>
    </Stack>
  );
}

function SchemaTable({ entries }: { entries: FieldSchemaEntry[] }) {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Field</TableCell>
            <TableCell>Shown in UI</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Channel</TableCell>
            <TableCell>Type</TableCell>
            <TableCell sx={{ minWidth: 220 }}>Accepted Values</TableCell>
            <TableCell>Char Limit</TableCell>
            <TableCell>Required</TableCell>
            <TableCell sx={{ minWidth: 300 }}>Description</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.field}>
              <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap", verticalAlign: "top" }}>{e.field}</TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {e.shown_in_ui
                  ? <Chip size="small" label="Shown" variant="outlined" />
                  : <Chip size="small" label="Not shown" color="warning" />}
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                <Chip size="small" label={e.category} color={categoryColor[e.category] ?? "default"} />
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {e.channel ? <Chip size="small" label={e.channel} variant="outlined" /> : "—"}
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>{e.type}</TableCell>
              <TableCell sx={{ verticalAlign: "top" }}><AcceptedValuesCell entry={e} /></TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>{e.char_limit ? `≤${e.char_limit}` : "—"}</TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {e.required_for_submit ? <CheckIcon fontSize="small" color="action" /> : ""}
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                <Typography variant="body2">{e.description}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function SchemaReference() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [tab, setTab] = useState<TabKey>("actions");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.getSchemaReference().then(setSchema);
  }, []);

  const filtered = useMemo(() => {
    if (!schema) return [];
    const rows = schema[tab];
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) => e.field.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
  }, [schema, tab, filter]);

  if (!schema) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Schema Reference</Typography>
      <Typography variant="body2" color="text.secondary">
        Read-only — every field's category, channel, type, and accepted values, pulled live from the backend
        so this can never drift out of sync with the actual code. "Shown in UI" means the field appears
        somewhere in the app today (the Actions/Insights list table or the full editor page) — a field can be
        tracked here and still not be surfaced to any user. To change a value, vocab, or UI visibility, edit
        the backend/frontend code (rbac_matrix.py / tag_logic.py / the editor pages) — not here.
      </Typography>
      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)}>
        <Tab value="actions" label={`Actions (${schema.actions.length})`} />
        <Tab value="insights" label={`Insights (${schema.insights.length})`} />
        <Tab value="interactions" label={`Interactions (${schema.interactions.length})`} />
      </Tabs>
      <TextField
        size="small" label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)}
        sx={{ maxWidth: 320 }}
      />
      <SchemaTable entries={filtered} />
    </Stack>
  );
}
