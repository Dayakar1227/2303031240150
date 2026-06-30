import { AppBar, Toolbar, Typography, Box, Stack, Button } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { tokens } from '../theme/theme';

const NAV_ITEMS = [
  { to: '/', label: 'All Notifications' },
  { to: '/priority', label: 'Priority Inbox' },
];

export default function Masthead() {
  const location = useLocation();

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar sx={{ minHeight: 72, gap: 4 }}>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography variant="h5" component="span" sx={{ fontWeight: 700 }}>
            Noticeboard
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: tokens.slate, display: { xs: 'none', sm: 'inline' } }}
          >
            campus notifications
          </Typography>
        </Stack>

        <Box sx={{ flex: 1 }} />

        <Stack direction="row" spacing={0.5}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                sx={{
                  px: 1.75,
                  color: active ? tokens.ink : tokens.slate,
                  fontWeight: active ? 700 : 600,
                  position: 'relative',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: 14,
                    right: 14,
                    bottom: 6,
                    height: 2,
                    backgroundColor: active ? tokens.indigo : 'transparent',
                  },
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
