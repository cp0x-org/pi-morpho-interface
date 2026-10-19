import { FC } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { FormattedMessage } from 'react-intl';

interface BalanceReadErrorProps {
  /** The read's `isError`; nothing renders while it is false. */
  isError: boolean;
  onRetry?: () => unknown;
  id?: string;
}

/**
 * Tells the user a balance could not be read instead of letting it pass for zero. A read that failed (RPC down, origin
 * not allowed, rate limited) has no data, and every form formats "no data" as "0", which looks exactly like an empty
 * wallet.
 */
export const BalanceReadError: FC<BalanceReadErrorProps> = ({ isError, onRetry, id }) => {
  if (!isError) return null;
  return (
    <Box id={id} role="alert" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
      <Typography variant="body2" color="error">
        <FormattedMessage id="common.balanceReadError" />
      </Typography>
      {onRetry && (
        <Button size="small" variant="text" color="error" onClick={() => onRetry()} sx={{ minWidth: 0, px: 1 }}>
          <FormattedMessage id="common.retry" />
        </Button>
      )}
    </Box>
  );
};
