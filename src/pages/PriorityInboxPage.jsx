import { useMemo, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { tokens } from '../theme/theme';
import { TYPE_OPTIONS, rankTopN } from '../utils/priority';
import { useNotificationPool } from '../hooks/useNotificationPool';
import { getViewedIds } from '../utils/viewedTracker';
import NotificationRow from '../components/NotificationRow';
import { LoadingRows, ErrorState, EmptyState } from '../components/StatusStates';
import TokenBar from '../components/TokenBar';

const N_OPTIONS = [10, 15, 20];

export default function PriorityInboxPage() {
  const [n, setN] = useState(10);
  const [typeFilter, setTypeFilter] = useState(null);
  const [, forceRerender] = useState(0);

  const { pool, status, error, reload } = useNotificationPool({ notificationType: typeFilter });
  const viewedIds = useMemo(() => getViewedIds(), [pool]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = useMemo(() => rankTopN(pool, n), [pool, n]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'flex-end' }} justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Priority Inbox
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.slate }}>
            Ranked by type — Placement, then Result, then Event — newest first within each
          </Typography>
        </Box>
      </Stack>

      <TokenBar onTokenSaved={() => { forceRerender((v) => v + 1); reload(); }} />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <ToggleButtonGroup
          size="small"
          value={typeFilter}
          exclusive
          onChange={(_e, v) => setTypeFilter(v)}
          aria-label="filter by notification type"
        >
          <ToggleButton value={null} sx={{ px: 1.5 }}>
            All types
          </ToggleButton>
          {TYPE_OPTIONS.map((t) => (
            <ToggleButton key={t} value={t} sx={{ px: 1.5 }}>
              {t}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" sx={{ color: tokens.slate }}>
            Show top
          </Typography>
          <Select size="small" value={n} onChange={(e) => setN(e.target.value)} sx={{ minWidth: 72 }}>
            {N_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </Select>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={reload}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ borderColor: tokens.hairline, overflow: 'hidden' }}>
        {status === 'loading' && <LoadingRows count={Math.min(n, 8)} />}

        {status === 'error' && <ErrorState message={error} onRetry={reload} />}

        {status === 'success' && top.length === 0 && (
          <EmptyState
            title="No notifications to prioritize"
            description={
              typeFilter
                ? `There are no ${typeFilter.toLowerCase()} notifications right now.`
                : 'Nothing in the inbox to rank yet.'
            }
          />
        )}

        {status === 'success' &&
          top.map((n_, idx) => (
            <NotificationRow
              key={n_.ID}
              notification={n_}
              isUnread={!viewedIds.has(n_.ID)}
              rank={idx + 1}
            />
          ))}
      </Paper>
    </Container>
  );
}
