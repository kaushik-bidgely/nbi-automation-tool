import { useEffect, useState } from "react";
import { Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody, Paper, Chip } from "@mui/material";
import { api } from "../api";

export default function AuditLog() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    api.auditLog().then(setRows);
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Audit Log</Typography>
      <Typography variant="body2" color="text.secondary">
        Every field edit, who made it (role), and what changed — free with a real
        tool instead of a spreadsheet, and the basis for "who changed this" questions.
      </Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell><TableCell>Entity</TableCell><TableCell>Field</TableCell>
              <TableCell>Old</TableCell><TableCell>New</TableCell><TableCell>Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.changed_at).toLocaleString()}</TableCell>
                <TableCell>{r.entity_type} #{r.entity_id}</TableCell>
                <TableCell>{r.field}</TableCell>
                <TableCell sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.old_value}</TableCell>
                <TableCell sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.new_value}</TableCell>
                <TableCell><Chip size="small" label={r.changed_by_role} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                    No changes recorded yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
