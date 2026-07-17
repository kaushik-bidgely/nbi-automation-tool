import { useEffect, useState } from "react";
import { Box, Typography, Paper, Chip } from "@mui/material";

export default function ImagePreview({
  label, url, spec,
}: {
  label: string; url: string; spec: { width: number; height: number } | null;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDims(null);
    setError(false);
    if (!url) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setError(true);
    img.src = url;
  }, [url]);

  const mismatch = !!(spec && dims && (dims.w !== spec.width || dims.h !== spec.height));

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="caption" display="block" fontWeight={600}>{label}</Typography>
      {spec && (
        <Typography variant="caption" display="block" color="text.secondary">
          Required: {spec.width}×{spec.height}px — locked, not user-editable
        </Typography>
      )}
      <Box
        sx={{
          mt: 1, height: 140, display: "flex", alignItems: "center", justifyContent: "center",
          bgcolor: "grey.100", borderRadius: 1, overflow: "hidden",
        }}
      >
        {!url && <Typography variant="caption" color="text.disabled">No image URL set</Typography>}
        {url && error && <Typography variant="caption" color="error">Failed to load image</Typography>}
        {url && !error && <img src={url} alt={label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
      </Box>
      {dims && (
        <Box sx={{ mt: 1 }}>
          <Chip
            size="small"
            label={`Actual: ${dims.w}×${dims.h}px`}
            color={mismatch ? "error" : spec ? "success" : "default"}
          />
          {mismatch && (
            <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
              Doesn't match the required {spec!.width}×{spec!.height}px — this image will render incorrectly.
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
}
