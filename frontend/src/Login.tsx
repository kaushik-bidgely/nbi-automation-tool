import { useState } from "react";
import { Box, Paper, Stack, TextField, Button, Typography, Alert } from "@mui/material";
import { useAuth } from "./AuthContext";

export default function Login() {
  const { login, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
    } catch {
      // error surfaced via useAuth().error
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{
      display: "flex", justifyContent: "center", alignItems: "center", height: "100vh",
      background: "linear-gradient(135deg, #eef2ff 0%, #f8f9fc 60%)",
    }}>
      <Paper sx={{ p: 4, width: 380, border: "1px solid", borderColor: "divider" }} component="form" onSubmit={submit}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 2, bgcolor: "primary.main",
            color: "primary.contrastText", display: "flex", alignItems: "center",
            justifyContent: "center", fontWeight: 800, fontSize: 18,
          }}>
            N
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>NBI Automation</Typography>
            <Typography variant="caption" color="text.secondary">Sign in to continue</Typography>
          </Box>
        </Stack>
        <Stack spacing={2}>
          <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} size="small" autoFocus />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} size="small" />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" disabled={busy || !username || !password} size="large">Sign In</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
