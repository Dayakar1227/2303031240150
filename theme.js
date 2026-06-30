import { createTheme } from '@mui/material/styles';

/**
 * Design tokens — "campus noticeboard" direction.
 *
 * Color
 *   paper    #F7F5F0  warm off-white, like noticeboard card stock
 *   ink      #1C1B19  near-black text
 *   indigo   #2B3A67  Placement ribbon — the highest-stakes notice type
 *   amber    #B9762C  Result ribbon
 *   slate    #6B7280  Event ribbon / secondary text
 *   hairline #E3DDCF  dividers, borders
 *   signal   #C0392B  unread marker
 *
 * Type
 *   Display: Fraunces (serif, characterful) — page titles, masthead
 *   Body:    Inter — everything else
 *   Mono:    IBM Plex Mono — timestamps, IDs, counts (data, not prose)
 *
 * Signature element: a 4px solid "ribbon" on the left edge of every
 * notification row, colored by type, with unread rows getting a solid
 * signal dot instead of an outline — consistent across both pages.
 */

export const tokens = {
  paper: '#F7F5F0',
  ink: '#1C1B19',
  indigo: '#2B3A67',
  amber: '#B9762C',
  slate: '#6B7280',
  hairline: '#E3DDCF',
  signal: '#C0392B',
  surface: '#FFFFFF',
};

export const typeColor = {
  Placement: tokens.indigo,
  Result: tokens.amber,
  Event: tokens.slate,
};

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: tokens.paper,
      paper: tokens.surface,
    },
    text: {
      primary: tokens.ink,
      secondary: tokens.slate,
    },
    primary: {
      main: tokens.indigo,
    },
    warning: {
      main: tokens.amber,
    },
    error: {
      main: tokens.signal,
    },
    divider: tokens.hairline,
  },
  shape: {
    borderRadius: 4,
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    h1: { fontFamily: '"Fraunces", serif', fontWeight: 600, letterSpacing: '-0.01em' },
    h2: { fontFamily: '"Fraunces", serif', fontWeight: 600, letterSpacing: '-0.01em' },
    h3: { fontFamily: '"Fraunces", serif', fontWeight: 600 },
    h4: { fontFamily: '"Fraunces", serif', fontWeight: 600 },
    h5: { fontFamily: '"Fraunces", serif', fontWeight: 600 },
    h6: { fontFamily: '"Fraunces", serif', fontWeight: 600 },
    subtitle2: { fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '0.02em' },
    caption: { fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '0.01em' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.paper,
          color: tokens.ink,
          borderBottom: `1px solid ${tokens.hairline}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.72rem',
          letterSpacing: '0.02em',
        },
      },
    },
  },
});

export default theme;
