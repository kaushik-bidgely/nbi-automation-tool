import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Stack, Typography, Box, Button, Chip, Alert, Divider } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api } from "../api";
import { useRole, usePermissions } from "../AuthContext";
import {
  ACTION_CHAR_LIMITS, ACTION_EMAIL_FIELDS, ACTION_PAPER_FIELDS, IMAGE_SPECS,
  RECO_TYPES, BENEFIT_SCALE, COST_SCALE, EFFORT_SCALE, INCOME_LEVELS, OWNERSHIP, SEASONS, PERSONAS,
} from "../fieldGroups";
import ImagePreview from "../ImagePreview";
import FieldGroup from "../FieldGroup";
import TagEditor, { type TagField } from "../TagEditor";
import { buildTagStringPreview } from "../tagPreview";

const IDENTITY_FIELDS = ["action_id", "nbi_family", "nbi_type", "fuel_type", "appliance"];
const EMAIL_FIELDS = [...ACTION_EMAIL_FIELDS];
const PAPER_FIELDS = [...ACTION_PAPER_FIELDS, "cta_text", "cta_link_name"];
const FILTER_FIELDS = ["utility_objectives", "filter_ownership", "filter_season"];
const ADDITIONAL_FIELDS = ["channels", "cta_link"];

const TAG_ROWS: TagField[][] = [
  [
    { type: "single", field: "reco_type", label: "Reco Type", options: RECO_TYPES },
    { type: "single", field: "benefit_scale", label: "Benefit Scale", options: BENEFIT_SCALE },
  ],
  [
    { type: "single", field: "cost_scale", label: "Cost Scale", options: COST_SCALE },
    { type: "single", field: "effort_scale", label: "Effort Scale", options: EFFORT_SCALE },
  ],
  [
    { type: "multi", field: "income_level", label: "Income Level", options: INCOME_LEVELS },
    { type: "multi", field: "ownership", label: "Ownership", options: OWNERSHIP },
  ],
  [
    { type: "multi", field: "season", label: "Season", options: SEASONS },
    { type: "multi", field: "persona", label: "Persona", options: PERSONAS },
  ],
  [
    { type: "bool", field: "diy", label: "DIY" },
    { type: "bool", field: "selfie", label: "Requires selfie" },
    { type: "number", field: "strike_low", label: "Strike low" },
    { type: "number", field: "strike_high", label: "Strike high" },
  ],
];

export default function ActionEditor() {
  const { id } = useParams();
  const { role } = useRole();
  const permissions = usePermissions("action");
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [dirty, setDirty] = useState<Record<string, any>>({});
  const [issues, setIssues] = useState<string[] | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = () => {
    setNotFound(false);
    api.getAction(Number(id)).then(setData).catch(() => setNotFound(true));
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (field: string, value: any) => {
    setData((d) => (d ? { ...d, [field]: value } : d));
    setDirty((d) => ({ ...d, [field]: value }));
  };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    await api.updateAction(Number(id), dirty);
    setDirty({});
    setSaveMsg("Saved");
    setIssues(null);
    setTimeout(() => setSaveMsg(null), 2000);
    load(); // pick up the server-regenerated tag_string
  };

  const validate = async () => {
    const res = await api.validateAction(Number(id));
    setIssues(res.issues);
  };

  const submit = async () => {
    await save();
    try {
      await api.submitAction(Number(id));
      load();
    } catch (e: any) {
      const parsed = JSON.parse(e.message);
      setIssues(parsed.issues ?? [String(e.message)]);
    }
  };

  const unlock = async () => {
    await api.unlockAction(Number(id));
    load();
  };

  if (notFound) {
    return (
      <Stack spacing={2} alignItems="flex-start">
        <Alert severity="warning">Action #{id} doesn't exist — it may have been deleted.</Alert>
        <Button component={Link} to="/actions" startIcon={<ArrowBackIcon />}>Back to Actions</Button>
      </Stack>
    );
  }
  if (!data) return <Typography>Loading…</Typography>;

  const locked = data.status === "published";
  const canUnlock = role === "admin" || role === "tpm_csm";

  return (
    <Stack direction="row" spacing={3} sx={{ alignItems: "flex-start" }}>
      <Stack spacing={2} sx={{ maxWidth: 700, flex: 1 }}>
        <Button component={Link} to="/actions" size="small" startIcon={<ArrowBackIcon />} sx={{ alignSelf: "flex-start" }}>
          Back to Actions
        </Button>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h5">{data.action_id}</Typography>
          <Chip label={data.status} />
        </Box>
        <Stack direction="row" spacing={1}>
          <Button component={Link} to={`/actions/${id}/review`} size="small">Preview utility-review view</Button>
        </Stack>

        {issues && issues.length > 0 && (
          <Alert severity="warning">
            {issues.map((i) => <div key={i}>{i}</div>)}
          </Alert>
        )}
        {issues && issues.length === 0 && <Alert severity="success">No validation issues</Alert>}
        {saveMsg && <Alert severity="success">{saveMsg}</Alert>}
        {locked && (
          <Alert severity="info">
            This action is Published. {canUnlock ? "Unlock it below to make changes." : "Only Admin or TPM/CSM can unlock it to make changes."}
          </Alert>
        )}

        <FieldGroup title="Identity & Classification" fields={IDENTITY_FIELDS} data={data}
          permissions={permissions} charLimits={ACTION_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <FieldGroup title="Email-specific content" fields={EMAIL_FIELDS} data={data}
          permissions={permissions} charLimits={ACTION_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <FieldGroup title="Paper-specific content" fields={PAPER_FIELDS} data={data}
          permissions={permissions} charLimits={ACTION_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <FieldGroup title="Filters — high blast radius" fields={FILTER_FIELDS} data={data}
          permissions={permissions} charLimits={ACTION_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <FieldGroup title="Additional Settings" fields={ADDITIONAL_FIELDS} data={data}
          permissions={permissions} charLimits={ACTION_CHAR_LIMITS} locked={locked} onChange={onChange} />
        <TagEditor title="Targeting & Scoring Tags" rows={TAG_ROWS} data={data}
          permissions={permissions} locked={locked} preview={buildTagStringPreview(data)} onChange={onChange} />

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
        <Typography variant="subtitle1">Image Previews</Typography>
        <ImagePreview label="Icon" url={data.icon_url ?? ""} spec={IMAGE_SPECS.icon_url} />
        <ImagePreview label="Paper image" url={data.image_paper_url ?? ""} spec={IMAGE_SPECS.image_paper_url} />
        <ImagePreview label="Email image" url={data.image_email_url ?? ""} spec={IMAGE_SPECS.image_email_url} />
        <FieldGroup title="Image URLs" fields={["icon_url", "image_paper_url", "image_email_url"]} data={data}
          permissions={permissions} locked={locked} onChange={onChange} />
      </Stack>
    </Stack>
  );
}
