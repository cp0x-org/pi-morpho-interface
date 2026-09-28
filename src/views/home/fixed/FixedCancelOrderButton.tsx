import type { MouseEvent } from 'react';
import { useIntl } from 'react-intl';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import { Button, CircularProgress, Typography } from '@mui/material';

import { midnightQueryKeys } from 'hooks/midnight/queryKeys';
import { useMarkOrderCancelled, type FixedOpenOrder } from 'hooks/midnight/useMidnightOpenOrders';
import { useTxSteps } from 'hooks/midnight/useTxSteps';
import { getOrderKind } from 'utils/midnight';
import { cancelOrderRequest } from 'utils/midnightTx';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';

interface FixedCancelOrderButtonProps {
  order: FixedOpenOrder;
  /** Refreshes what the order leaves behind, e.g. the collateral it parked, which becomes a plain position. */
  onCancelled: () => void;
}

// ==============================|| FIXED-RATE CANCEL ORDER ||============================== //

export default function FixedCancelOrderButton({ order, onCancelled }: FixedCancelOrderButtonProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const tx = useTxSteps(order.chainId);
  const markCancelled = useMarkOrderCancelled();

  const handleClick = async (event: MouseEvent) => {
    event.stopPropagation();
    const label = intl.formatMessage({ id: 'fixed.orders.cancel' });
    const succeeded = await tx.run([{ key: 'cancel', label, build: () => cancelOrderRequest(order.chainId, order.group, order.maker) }]);
    if (succeeded) {
      markCancelled(order);
      dispatchSuccess(intl.formatMessage({ id: 'fixed.orders.cancelSuccess' }));
      tx.reset();
      queryClient.invalidateQueries({ queryKey: midnightQueryKeys.all });
      onCancelled();
    } else {
      dispatchError(intl.formatMessage({ id: 'fixed.orders.cancelFailed' }));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
      <Button
        variant="outlined"
        color="error"
        size="small"
        onClick={handleClick}
        disabled={tx.isRunning}
        startIcon={tx.isRunning ? <CircularProgress size={14} color="inherit" aria-hidden="true" /> : undefined}
        aria-label={intl.formatMessage(
          { id: 'fixed.orders.cancelAria' },
          { side: intl.formatMessage({ id: `fixed.orders.side.${getOrderKind(order)}` }) }
        )}
      >
        {intl.formatMessage({ id: tx.isRunning ? 'fixed.orders.cancelling' : 'fixed.orders.cancel' })}
      </Button>
      {tx.error && (
        <Typography variant="caption" color="error" role="alert" sx={{ maxWidth: 220, wordBreak: 'break-word' }}>
          {tx.error}
        </Typography>
      )}
    </Box>
  );
}
