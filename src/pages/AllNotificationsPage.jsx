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
  Pagination,
  Paper,
} from '@mui/material';
import { tokens } from '../theme/theme';
import { TYPE_OPTIONS } from '../utils/priority';
import { useNotificationsFeed } from '../hooks/useNotificationsFeed';
import { getViewedIds } from '../utils/viewedTracker';
import NotificationRow from '../components/NotificationRow';
import { LoadingRows, ErrorState, EmptyState } from '../components/StatusStates';
import TokenBar from '../components/TokenBar';

const LIMIT_OPTIONS = [10, 20, 50];

export default function AllNotificationsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [typeFilter, setTypeFilter] = useState(null);
  const [, forceRerender] = useState(0);

  const { notifications, total, status, error, reload } = useNotificationsFeed({
    limit,
    page,
    notificationType: typeFilter,
  });

  const viewedIds = useMemo(() => getViewedIds(), [notifications]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeChange = (_e, value) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleLimitChange = (e) => {
    setLimit(e.target.value);
    setPage(1);
  };

  const pageCount = total ? Math.max(1, Math.ceil(total / limit)) : page + (notifications.length === limit ? 1 : 0);
  const unreadCount = notifications.filter((n) => !viewedIds.has(n.ID)).length;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'flex-end' }} justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            All Notifications
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.slate }}>
            {status === 'success'
              ? `${notifications.length} shown on this page${unreadCount ? ` · ${unreadCount} new` : ''}`
              : 'Every notice, newest first'}
          </Typography>
        </Box>
      </Stack>

      <TokenBar onTokenSaved={() => { forceRerender((n) => n + 1); reload(); }} />

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
          onChange={handleTypeChange}
          aria-label="filter by notification type"
        >
          <ToggleButton value={null} sx={{ px: 1.5 }}>
            All
          </ToggleButton>
          {TYPE_OPTIONS.map((t) => (
            <ToggleButton key={t} value={t} sx={{ px: 1.5 }}>
              {t}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" sx={{ color: tokens.slate }}>
            Per page
          </Typography>
          <Select size="small" value={limit} onChange={handleLimitChange} sx={{ minWidth: 76 }}>
            {LIMIT_OPTIONS.map((l) => (
              <MenuItem key={l} value={l}>
                {l}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ borderColor: tokens.hairline, overflow: 'hidden' }}>
        {status === 'loading' && <LoadingRows count={limit > 10 ? 8 : limit} />}

        {status === 'error' && <ErrorState message={error} onRetry={reload} />}

        {status === 'success' && notifications.length === 0 && (
          <EmptyState
            title="Nothing here yet"
            description={
              typeFilter
                ? `There are no ${typeFilter.toLowerCase()} notifications on this page. Try a different filter or page.`
                : 'No notifications to show right now. Check back later.'
            }
          />
        )}

        {status === 'success' &&
          notifications.map((n) => (
            <NotificationRow key={n.ID} notification={n} isUnread={!viewedIds.has(n.ID)} />
          ))}
      </Paper>

      {status === 'success' && notifications.length > 0 && (
        <Stack alignItems="center" sx={{ mt: 3 }}>
          <Pagination
            page={page}
            count={pageCount}
            onChange={(_e, p) => setPage(p)}
            shape="rounded"
            color="primary"
          />
        </Stack>
      )}
    </Container>
  );
}
