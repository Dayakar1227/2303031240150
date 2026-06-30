import { useEffect, useRef } from 'react';
import { Box, Stack, Typography, Chip } from '@mui/material';
import { typeColor, tokens } from '../theme/theme';
import { markAsViewed } from '../utils/viewedTracker';

function formatTimestamp(ts) {
  if (!ts) return '—';
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * One notification row. Ribbon color encodes type (Placement/Result/Event);
 * an unread row gets a solid signal dot in place of the rank/spacer slot.
 * Marks itself as viewed shortly after entering the viewport via
 * IntersectionObserver, so opening the page (not just clicking) is what
 * distinguishes "new" from "already viewed" — matching how a person
 * actually reads a noticeboard.
 */
export default function NotificationRow({ notification, isUnread, rank }) {
  const rowRef = useRef(null);

  useEffect(() => {
    const node = rowRef.current;
    if (!node || !isUnread) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            markAsViewed(notification.ID);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [notification.ID, isUnread]);

  const ribbonColor = typeColor[notification.Type] ?? tokens.slate;

  return (
    <Box
      ref={rowRef}
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${tokens.hairline}`,
        backgroundColor: isUnread ? 'rgba(43, 58, 103, 0.03)' : 'transparent',
      }}
    >
      <Box sx={{ width: 4, backgroundColor: ribbonColor, flexShrink: 0 }} />

      {rank !== undefined && (
        <Box
          sx={{
            width: 44,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"IBM Plex Mono", monospace',
            color: tokens.slate,
            fontSize: '0.85rem',
            borderRight: `1px solid ${tokens.hairline}`,
          }}
        >
          {String(rank).padStart(2, '0')}
        </Box>
      )}

      <Box sx={{ flex: 1, px: 2.5, py: 1.75, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          {isUnread && (
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: tokens.signal,
                flexShrink: 0,
              }}
              aria-label="unread"
            />
          )}
          <Chip
            size="small"
            label={notification.Type}
            sx={{
              backgroundColor: `${ribbonColor}1A`,
              color: ribbonColor,
              fontWeight: 600,
              height: 22,
            }}
          />
          <Typography variant="caption" sx={{ color: tokens.slate, ml: 'auto', flexShrink: 0 }}>
            {formatTimestamp(notification.Timestamp)}
          </Typography>
        </Stack>
        <Typography
          variant="body1"
          sx={{
            fontWeight: isUnread ? 600 : 400,
            color: tokens.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={notification.Message}
        >
          {notification.Message}
        </Typography>
      </Box>
    </Box>
  );
}
