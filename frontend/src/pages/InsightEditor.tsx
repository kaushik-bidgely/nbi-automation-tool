import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Stack, Typography, Button, Chip, Alert, Divider } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api } from "../api";
import { useRole, usePermissions } from "../AuthContext";
import {
  INSIGHT_CHAR_LIMITS,
  COMPARISON_TYPES, DIRECTIONS, DATA_SOURCES, INSIGHT_SEASONS, TOU_PERIODS,
  GENERIC_INSIGHT_TYPES, CHALLENGE_STATUSES,
} from "../fieldGroups";
import ImagePreview from "../ImagePreview";
import FieldGroup from "../FieldGroup";
import TagEditor, { type TagField } from "../TagEditor";
import { buildInsightTagStringPreview } from "../tagPreview";

const IDENTITY_FIELDS = ["insight_id", "appliance", "fuel_type", "channel", "variable_name"];
const EMAIL_FIELDS = ["subject_line", "insight_text"];
const PAPER_FIELDS = ["insight_semantic", "paper_text"];

const TAG_ROWS: TagField[][] = [
  [
    { type: "single", field: "comparison_type", label: "Comparison Type", options: COMPARISON_TYPES },
    { type: "single", field: "direction", label: "Direction", options: DIRECTIONS },
  ],
  [
    { type: "single", field: "data_source", label: "Data Source", options: DATA_SOURCES },
    { type: "single", field: "challenge_status", label: "Challenge Status", options: CHALLENGE_STATUSES },
  ],
  [
    { type: "multi", field: "season", label: "Season", options: INSIGHT_SEASONS },
    { type: "multi", field: "tou_period", label: "TOU Period", options: TOU_PERIODS },
  ],
  [
    { type: "single", field: "generic_insight_type", label: "Generic Insight Type", options: GENERIC_INSIGHT_TYPES },
    { type: "bool", field: "generic_insight", label: "Generic (little/no data)" },
  ],
  [
    { type: "number", field: "min_value", label: "Min value ($)" },
    { type: "number", field: "max_value", label: "Max value ($)" },
  ],
];

export default function InsightEditor() {
  const { id } = useParams();
  const { role } = useRole();
  const permissions = usePermissions("insight");
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [dirty, setDirty] = useState<Record<string, any>>({});
  const [issues, setIssues] = useState<string[] | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = () => {
    setNotFound(false);
    api.getInsight(Number(id)).then(setData).catch(() => setNotFound(true));
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (field: string, value: any) => {
    setData((d) => (d ? { ...d, [field]: value } : d));
    setDirty((d) => ({ ...d, [field]: value }));
  };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    await api.updateInsight(Number(id), dirty);
    setDirty({});
    setSaveMsg("Saved");
    setIssues(null);
    setTimeout(() => setSaveMsg(null), 2000);
    load(); // pick up the server-regenerated tag_string
  };

  const validate = async () => {
    const res = await api.validateInsight(Number(id));
    setIssues(res.issues);
  };

  const submit = async () => {
    await save();
    try {
      await api.submitInsight(Number(id));
      load();
    } catch (e: any) {
      const parsed = JSON.parse(e.message);
      setIssues(parsed.issues ?? [String(e.message)]);
    }
  };

  const unlock = async () => {
    await api.unlockInsight(Number(id));
    load();
  };

  if (notFound) {
    return (
      <Stack spacing={2} alignItems="flex-start">
        <Alert severity="warning">Insight #{id} doesn't exist — it may have been deleted.</Alert>
        <Button component={Link} to="/insights" startIcon={<ArrowBackIcon />}>Back to Insights</Button>
      </Stack>
    );
  }
  if (!data) return <Typography>Loading…</Typography>;

  const locked = data.status === "published";
  const canUnlock = role === "admin" || role === "tpm_csm";

  return (
    <Stack direction="row" spacing={3} sx={{ alignItems: "flex-start" }}>
      <Stack spacing={2} sx={{ maxWidth: 700, flex: 1 }}>
        <Button component={Link} to="/insights" size="small" startIcon={<ArrowBackIcon />} sx={{ alignSelf: "flex-start" }}>
          Back to Insights
        </Button>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">{data.insight_id}</Typography>
          <Chip label={data.status} />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button component={Link} to={`/insights/${id}/review`} size="small">Preview utility-review view</Button>
        </Stack>

        {issues && issues.length > 0 && <Alert severity="warning">{issues.map((i) => <div key={i}>{i}</div>)}</Alert>}
        {issues && issues.length === 0 && <Alert severity="success">No validation issues</Alert>}
        {saveMsg && <Alert severity="success">{saveMsg}</Alert>}
        {locked && (
          <Alert severity="info">
            This insight is Published. {canUnlock ? "Unlock it below to make changes." : "Only Admin or TPM/CSM can unlock it to make changes."}
          </Alert>
        )}

        <FieldGroup title="Identity" fields={IDENTITY_FIELDS} data={data}
          permissions={permissions} charLimits={INSIGHT_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <FieldGroup title="Email-specific content" fields={EMAIL_FIELDS} data={data}
          permissions={permissions} charLimits={INSIGHT_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <FieldGroup title="Paper-specific content" fields={PAPER_FIELDS} data={data}
          permissions={permissions} charLimits={INSIGHT_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <FieldGroup title="Icon" fields={["icon_url"]} data={data}
          permissions={permissions} charLimits={INSIGHT_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <TagEditor title="Targeting & Scoring Tags" rows={TAG_ROWS} data={data}
          permissions={permissions} locked={locked} preview={buildInsightTagStringPreview(data)} onChange={onChange} />

        <Divider />
        <Stack direction="row" spacing={2}>
          {locked ? (
            <Button variant="contained" color="warning" onClick={unlock} disabled={!canUnlock}>Unlock</Button>
          ) : (
            <>
              <Button variant="contained" onClick={save} disabled={Object.keys(dirty).length === 0}>Save</Button>
              <Button variant="outlined" onClick={validate}>Validate</Button>
              <Button variant="outlined" color="secondary" onClick={submit}>Move to Ready for QA</Button>
            </>
          )}
        </Stack>
      </Stack>

      <Stack spacing={2} sx={{ width: 320, position: "sticky", top: 16 }}>
        <Typography variant="subtitle1">Image Preview</Typography>
        <ImagePreview label="Icon" url={data.icon_url ?? ""} spec={null} />
      </Stack>
    </Stack>
  );
}
