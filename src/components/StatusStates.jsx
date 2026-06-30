import { Box, Typography, Button, Skeleton, Stack } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { tokens } from '../theme/theme';

export function LoadingRows({ count = 6 }) {
  return (
    <Stack divider={<Box sx={{ borderBottom: `1px solid ${tokens.hairline}` }} />}>
      {Array.from({ length: count }).map((_, i) => (
        <Box key={i} sx={{ display: 'flex', px: 2.5, py: 1.75, gap: 2 }}>
          <Skeleton variant="rounded" width={70} height={22} />
          <Skeleton variant="text" width="50%" height={28} />
        </Box>
      ))}
    </Stack>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <Box
      sx={{
        py: 7,
        px: 3,
        textAlign: 'center',
        border: `1px dashed ${tokens.signal}`,
        borderRadius: 1,
        backgroundColor: 'rgba(192, 57, 43, 0.04)',
      }}
    >
      <Typography variant="h6" sx={{ color: tokens.signal, mb: 1 }}>
        Couldn't load notifications
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.slate, mb: 2.5, maxWidth: 440, mx: 'auto' }}>
        {message}
      </Typography>
      {onRetry && (
        <Button variant="outlined" color="error" startIcon={<RefreshIcon />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </Box>
  );
}

export function EmptyState({ title, description }) {
  return (
    <Box sx={{ py: 8, px: 3, textAlign: 'center' }}>
      <Typography variant="h6" sx={{ color: tokens.ink, mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.slate, maxWidth: 420, mx: 'auto' }}>
        {description}
      </Typography>
    </Box>
  );
}
