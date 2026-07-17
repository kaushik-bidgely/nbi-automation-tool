import { createTheme, alpha } from "@mui/material/styles";

// Modern-SaaS direction (2026-07-06 redesign): indigo primary, soft neutral
// surfaces, rounded shapes, no shouty all-caps buttons, borders instead of
// heavy shadows. One theme file so every page benefits without per-page edits.

const primary = "#4f46e5";   // indigo-600
const primaryDark = "#4338ca";
const surface = "#f8f9fc";
const border = "#e4e7ec";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: primary, dark: primaryDark, contrastText: "#fff" },
    secondary: { main: "#0891b2" },
    success: { main: "#059669" },
    warning: { main: "#d97706" },
    error: { main: "#dc2626" },
    info: { main: "#2563eb" },
    background: { default: surface, paper: "#ffffff" },
    divider: border,
    text: { primary: "#111827", secondary: "#6b7280" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h4: { fontWeight: 700, letterSpacing: -0.5 },
    h5: { fontWeight: 700, letterSpacing: -0.3 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, color: "#6b7280" },
    button: { fontWeight: 600, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: surface } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#ffffff",
          color: "#111827",
          borderBottom: `1px solid ${border}`,
        },
      },
      defaultProps: { elevation: 0 },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, paddingInline: 16 },
        contained: { boxShadow: "none" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        elevation1: { boxShadow: "none", border: `1px solid ${border}` },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: "none", border: `1px solid ${border}` },
      },
    },
    MuiTableContainer: {
      styleOverrides: { root: { border: `1px solid ${border}`, borderRadius: 12 } },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-root": {
            backgroundColor: surface,
            fontWeight: 600,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: "#6b7280",
            borderBottom: `1px solid ${border}`,
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { "&:hover": { backgroundColor: alpha(primary, 0.04) } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 6 },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 8,
          "&.Mui-selected": {
            backgroundColor: alpha(primary, 0.1),
            color: primaryDark,
            "&:hover": { backgroundColor: alpha(primary, 0.15) },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { fontSize: 12 } },
    },
  },
});

export default theme;
