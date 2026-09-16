import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, Button, Link, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import ConnectButtonCustom from 'components/ConnectButtonCustom';
import { useExplorerUrl } from 'hooks/midnight/useExplorerUrl';
import type { TxStep, TxStepsState } from 'hooks/midnight/useTxSteps';
import { visuallyHidden } from 'utils/a11y';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import type { FixedMarketContext } from './types';

interface FixedTxButtonProps {
  ctx: FixedMarketContext;
  tx: TxStepsState;
  steps: TxStep[];
  actionLabel: string;
  successMessage: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

// ==============================|| FIXED-RATE TRANSACTION BUTTON ||============================== //

/** Runs approve → authorize → action in order, listing the steps when there is more than one. Transactions only start on a click. */
export default function FixedTxButton({ ctx, tx, steps, actionLabel, successMessage, disabled, onSuccess }: FixedTxButtonProps) {
  const intl = useIntl();
  const explorer = useExplorerUrl(ctx.chainId);

  if (!ctx.user) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, marginTop: '20px' }}>
        <Typography role="status" color="text.secondary">
          <FormattedMessage id="market.connectWallet" />
        </Typography>
        <ConnectButtonCustom />
      </Box>
    );
  }

  const handleClick = async () => {
    const succeeded = await tx.run(steps);
    if (succeeded) {
      dispatchSuccess(successMessage);
      tx.reset();
      ctx.refresh();
      onSuccess?.();
    } else {
      dispatchError(intl.formatMessage({ id: 'fixed.tx.failedToast' }));
    }
  };

  const txLink = tx.txHash ? explorer.tx(tx.txHash) : undefined;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, marginTop: '20px' }}>
      {steps.length > 1 && (
        <Box component="ol" aria-label={intl.formatMessage({ id: 'fixed.tx.stepsAria' })} sx={{ margin: 0, paddingLeft: 3 }}>
          {steps.map((step) => {
            const isDone = tx.completedSteps.includes(step.key);
            const isCurrent = tx.currentStep === step.key;
            return (
              <Typography
                key={step.key}
                component="li"
                variant="body2"
                color={isDone ? 'success.main' : isCurrent ? 'text.primary' : 'text.secondary'}
                fontWeight={isCurrent ? 'bold' : undefined}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  {step.label}
                  {isDone && (
                    <>
                      <CheckCircleIcon fontSize="inherit" aria-hidden="true" />
                      <Box component="span" sx={visuallyHidden}>
                        <FormattedMessage id="fixed.tx.stepDone" />
                      </Box>
                    </>
                  )}
                </Box>
              </Typography>
            );
          })}
        </Box>
      )}

      <Box role="status" aria-live="polite">
        {tx.isRunning && tx.phase && (
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id={`fixed.tx.${tx.phase}`} />
          </Typography>
        )}
        {txLink && (
          <Link href={txLink} target="_blank" rel="noopener noreferrer" variant="body2">
            <FormattedMessage id="fixed.tx.viewOnExplorer" />
          </Link>
        )}
      </Box>

      {tx.error && !tx.isRunning && (
        <Alert severity="error">
          <FormattedMessage id="fixed.tx.error" values={{ message: tx.error }} />
        </Alert>
      )}

      <Button
        variant="contained"
        color="primary"
        onClick={handleClick}
        disabled={disabled || tx.isRunning || steps.length === 0}
        sx={{ height: '58px', width: '100%', fontFamily: 'Roboto, Arial, sans-serif', fontSize: '18px', fontWeight: 700 }}
      >
        {tx.isRunning && tx.phase ? intl.formatMessage({ id: `fixed.tx.${tx.phase}` }) : actionLabel}
      </Button>
    </Box>
  );
}
