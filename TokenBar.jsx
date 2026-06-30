import { useState } from 'react';
import { Box, TextField, Button, Typography, Collapse, IconButton } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { tokens } from '../theme/theme';
import { TOKEN_STORAGE_KEY } from '../services/notificationsApi';

/**
 * The notifications API is a protected route. Rather than hard-coding or
 * assuming a token, this bar lets whoever is running the app locally paste
 * one in; it's stored in localStorage and attached to every request by the
 * api client's request interceptor.
 */
export default function TokenBar({ onTokenSaved }) {
  const [open, setOpen] = useState(() => !localStorage.getItem(TOKEN_STORAGE_KEY));
  const [value, setValue] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? '');

  const handleSave = () => {
    if (value.trim()) {
      localStorage.setItem(TOKEN_STORAGE_KEY, value.trim());
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    onTokenSaved?.();
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        size="small"
        startIcon={<LockOutlinedIcon fontSize="small" />}
        onClick={() => setOpen(true)}
        sx={{ color: tokens.slate, my: 1.5 }}
      >
        API token
      </Button>
    );
  }

  return (
    <Collapse in={open}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          mb: 2,
          backgroundColor: tokens.surface,
          border: `1px solid ${tokens.hairline}`,
          borderRadius: 1,
        }}
      >
        <LockOutlinedIcon fontSize="small" sx={{ color: tokens.slate }} />
        <Typography variant="body2" sx={{ color: tokens.slate, flexShrink: 0 }}>
          Bearer token
        </Typography>
        <TextField
          size="small"
          fullWidth
          type="password"
          placeholder="Paste the access token for the protected notifications route"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <Button variant="contained" size="small" onClick={handleSave} sx={{ flexShrink: 0 }}>
          Save
        </Button>
        <IconButton size="small" onClick={() => setOpen(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </Collapse>
  );
}
