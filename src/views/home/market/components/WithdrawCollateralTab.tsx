import Box from '@mui/material/Box';
import { Typography } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { AccrualPosition, MarketParams } from '@morpho-org/blue-sdk';
import { useWriteTransaction } from 'hooks/useWriteTransaction';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { TokenIcon } from 'components/TokenIcon';
import { CustomInput } from 'components/CustomInput';
import { useTheme } from '@mui/material/styles';
import { INPUT_DECIMALS, getMorphoAddress } from '@/appconfig';
import { formatAssetOutput, normalizePointAmount } from 'utils/formatters';
import { visuallyHidden } from 'utils/a11y';
import { FormattedMessage, useIntl } from 'react-intl';
import Divider from '@mui/material/Divider';
import { SAFETY_FACTOR_BPS } from 'utils/midnight';

interface WithdrawTabProps {
  market: MarketInterface;
  chainId: number;
  marketParams: MarketParams | null;
  accrualPosition: AccrualPosition | null;
  marketId: string;
  onSuccess?: () => void;

  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

export default function WithdrawCollateralTab({
  market,
  chainId,
  marketParams,
  accrualPosition,
  marketId,
  onCollateralAmountChange,
  onSuccess
}: WithdrawTabProps) {
  // Internal state management
  const theme = useTheme();
  const intl = useIntl();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const { address: userAddress } = useAccount();
  const morphoAddress = getMorphoAddress(chainId);
  const [txError, setTxError] = useState<string | null>(null);
  // Use the custom transaction hook
  const { sendTransaction, txState, txError: txRawError, isCompleted, resetTx } = useWriteTransaction();

  const collateralDecimals = market?.collateralAsset?.decimals ?? 0;
  const withdrawableCollateral = accrualPosition?.withdrawableCollateral ?? 0n;
  // Withdrawing right up to the liquidation limit leaves nothing for the interest that accrues before the
  // transaction lands or for the oracle moving, so it reverts; and a position left at the limit is liquidatable
  // anyway. Keep the same 6% of headroom as BorrowTab and the fixed-rate forms. Without debt it is all collateral.
  const safeWithdrawableCollateral = useMemo(() => {
    if (!accrualPosition) return 0n;
    const maxLtv = (accrualPosition.market.params.lltv * SAFETY_FACTOR_BPS) / 10_000n;
    return accrualPosition.market.getWithdrawableCollateral(accrualPosition, { maxLtv }) ?? 0n;
  }, [accrualPosition]);

  // Limits are compared in base units: going through floats lets an 18-decimal amount round up past the limit.
  const withdrawAmountBN = useMemo(() => {
    try {
      return withdrawAmount ? parseUnits(normalizePointAmount(withdrawAmount), collateralDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [withdrawAmount, collateralDecimals]);

  useEffect(() => {
    if (!market) {
      console.log('Market data not available');
      return;
    }

    let amount = withdrawAmount ? normalizePointAmount(withdrawAmount) : '0';

    const assetDecimals = market.collateralAsset.decimals;
    const amountBN = parseUnits(amount, assetDecimals);
    // const amountFloat = parseFloat(amount);
    // const multiplier = Math.pow(10, assetDecimals);
    // const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    // const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));
    onCollateralAmountChange(-amountBN);
  }, [withdrawAmount, market]);

  // Handle successful transaction completion
  useEffect(() => {
    if (isCompleted && txState === 'confirmed') {
      dispatchSuccess(
        intl.formatMessage({ id: 'withdrawCollateral.success' }, { amount: withdrawAmount, symbol: market.collateralAsset.symbol })
      );
      setWithdrawAmount('');

      // Call onSuccess to refresh the position data
      if (onSuccess) {
        onSuccess();
      }

      resetTx();
    }
  }, [isCompleted, txState, withdrawAmount, market.collateralAsset.symbol, onSuccess, resetTx, intl]);

  // Handle transaction errors
  useEffect(() => {
    if (txState === 'error' && txRawError) {
      dispatchError(intl.formatMessage({ id: 'withdrawCollateral.error' }));
      setTxError(intl.formatMessage({ id: 'withdrawCollateral.error' }));
    }
  }, [txState, txRawError, intl]);

  // Handle withdraw collateral
  const handleWithdraw = async () => {
    if (!userAddress || !marketId || !withdrawAmount || parseFloat(normalizePointAmount(withdrawAmount)) <= 0) {
      return;
    }

    if (!market || !marketParams || !morphoAddress) {
      dispatchError(intl.formatMessage({ id: 'tx.marketNotFound' }));
      return;
    }
    try {
      // Execute transaction using the custom hook
      await sendTransaction({
        address: morphoAddress as `0x${string}`,
        abi: morphoContractConfig.abi,
        chainId,
        functionName: 'withdrawCollateral',
        args: [
          {
            loanToken: marketParams.loanToken,
            collateralToken: marketParams.collateralToken,
            oracle: marketParams.oracle,
            irm: marketParams.irm,
            lltv: marketParams.lltv
          },
          withdrawAmountBN,
          userAddress as `0x${string}`,
          userAddress as `0x${string}`
        ]
      });
    } catch (error) {
      console.error('Error withdrawing collateral:', error);
      const message = error instanceof Error ? error.message : String(error);
      dispatchError(intl.formatMessage({ id: 'withdrawCollateral.errorWithReason' }, { message }));
      setTxError(intl.formatMessage({ id: 'withdrawCollateral.errorWithReason' }, { message }));
    }
  };

  // Handle percentage button clicks
  const handlePercentClick = useCallback(
    (percent: number) => {
      const value = formatUnits((safeWithdrawableCollateral * BigInt(percent)) / 100n, collateralDecimals);
      const [whole, fraction] = value.split('.');

      // The exact amount goes into the transaction; the field shows it cut to INPUT_DECIMALS, never rounded up.
      setWithdrawAmount(value);
      setInputAmount(formatAssetOutput(fraction ? `${whole}.${fraction.slice(0, INPUT_DECIMALS)}` : whole));

      // Set active percentage
      setActivePercentage(percent);
    },
    [safeWithdrawableCollateral, collateralDecimals]
  );

  // Determine if the button should be disabled
  const isButtonDisabled =
    !marketParams ||
    !morphoAddress ||
    withdrawAmountBN <= 0n ||
    withdrawAmountBN > safeWithdrawableCollateral ||
    txState === 'submitting' ||
    txState === 'submitted';

  // Determine button text based on transaction state
  const getButtonText = () => {
    switch (txState) {
      case 'submitting':
        return intl.formatMessage({ id: 'common.preparingTransaction' });
      case 'submitted':
        return intl.formatMessage({ id: 'common.withdrawing' });
      default:
        return intl.formatMessage({ id: 'common.withdraw' });
    }
  };

  const isTransactionInProgress = txState === 'submitting' || txState === 'submitted';
  const collateralSymbol = market?.collateralAsset?.symbol || intl.formatMessage({ id: 'common.tokenLower' });
  const exceedsWithdrawable = withdrawAmountBN > withdrawableCollateral;
  const exceedsSafeLimit = withdrawAmountBN > safeWithdrawableCollateral;
  // Surfaced to assistive tech / automation only: the visual design has no slot
  // for these messages, but the state itself is real and must be machine readable.
  const statusMessage =
    txError ||
    (exceedsWithdrawable
      ? intl.formatMessage({ id: 'withdrawCollateral.exceeds' }, { symbol: collateralSymbol })
      : exceedsSafeLimit
        ? intl.formatMessage({ id: 'withdrawCollateral.exceedsSafeLimit' }, { symbol: collateralSymbol })
        : '');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 0 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          padding: '20px',
          bgcolor: theme.palette.background.default,
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px'
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            height: '80px',
            alignItems: 'center',
            marginBottom: '20px',
            marginTop: '15px'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              width: '100%'
            }}
          >
            <Typography variant="body2" color="text.main" fontWeight="bold">
              <FormattedMessage id="withdrawCollateral.title" />
            </Typography>
            <Typography variant="body2">
              <FormattedMessage id="withdrawCollateral.amountLabel" />
            </Typography>
          </Box>
          <Box
            sx={{
              paddingRight: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            {market.collateralAsset?.symbol && (
              <TokenIcon
                sx={{ width: '45px', height: '45px', display: 'flex', alignItems: 'center', zIndex: 1, marginBottom: '15px' }}
                avatarProps={{ sx: { width: 45, height: 45 }, alt: '' }}
                symbol={market.collateralAsset?.symbol}
              />
            )}
            <Typography fontWeight="bold">{market.collateralAsset?.symbol || intl.formatMessage({ id: 'common.na' })}</Typography>
          </Box>
        </Box>
        <CustomInput
          autoFocus
          type="text"
          fullWidth
          value={inputAmount}
          onChange={(e) => {
            let val = formatAssetOutput(e.target.value);
            setWithdrawAmount(val);
            setInputAmount(val);
            // Clear active percentage when user manually enters a value
            if (activePercentage !== null) {
              setActivePercentage(null);
            }
          }}
          disabled={txState === 'submitting' || txState === 'submitted'}
          placeholder="0"
          inputProps={{
            inputMode: 'decimal',
            pattern: '[0-9]*,?[0-9]*',
            id: 'withdraw-collateral-amount',
            'aria-label': intl.formatMessage({ id: 'withdrawCollateral.inputAria' }, { symbol: collateralSymbol }),
            'aria-describedby': 'withdraw-collateral-limit withdraw-collateral-status',
            'aria-invalid': exceedsSafeLimit || undefined
          }}
        />
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            mb: 2
          }}
        >
          <Button
            variant="outlined"
            size="small"
            onClick={() => handlePercentClick(25)}
            disabled={isTransactionInProgress}
            aria-pressed={activePercentage === 25}
            aria-label={intl.formatMessage({ id: 'withdrawCollateral.percentAria' }, { percent: 25, symbol: collateralSymbol })}
            sx={{
              flex: 1,
              bgcolor: activePercentage === 25 ? theme.palette.secondary.main : 'transparent',
              color: activePercentage === 25 ? theme.palette.background.paper : 'inherit'
            }}
          >
            25%
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => handlePercentClick(50)}
            disabled={isTransactionInProgress}
            aria-pressed={activePercentage === 50}
            aria-label={intl.formatMessage({ id: 'withdrawCollateral.percentAria' }, { percent: 50, symbol: collateralSymbol })}
            sx={{
              flex: 1,
              bgcolor: activePercentage === 50 ? theme.palette.secondary.main : 'transparent',
              color: activePercentage === 50 ? theme.palette.background.paper : 'inherit'
            }}
          >
            50%
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => handlePercentClick(75)}
            disabled={isTransactionInProgress}
            aria-pressed={activePercentage === 75}
            aria-label={intl.formatMessage({ id: 'withdrawCollateral.percentAria' }, { percent: 75, symbol: collateralSymbol })}
            sx={{
              flex: 1,
              bgcolor: activePercentage === 75 ? theme.palette.secondary.main : 'transparent',
              color: activePercentage === 75 ? theme.palette.background.paper : 'inherit'
            }}
          >
            75%
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => handlePercentClick(100)}
            disabled={isTransactionInProgress}
            aria-pressed={activePercentage === 100}
            aria-label={intl.formatMessage({ id: 'withdrawCollateral.maxAria' }, { symbol: collateralSymbol })}
            sx={{
              flex: 1,
              bgcolor: activePercentage === 100 ? theme.palette.secondary.main : 'transparent',
              color: activePercentage === 100 ? theme.palette.background.paper : 'inherit'
            }}
          >
            <FormattedMessage id="common.max" />
          </Button>
        </Box>
      </Box>
      <Box
        sx={{
          width: '100%',
          padding: '25px 20px',
          border: '1px solid',
          borderTop: 'none',
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px',
          borderColor: theme.palette.grey[800],
          mt: '-25px'
        }}
      >
        <Box
          id="withdraw-collateral-limit"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            backgroundColor: theme.palette.background.paper,
            margin: '10px 0'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              backgroundColor: theme.palette.background.paper,
              margin: '10px 0 20px 0'
            }}
          >
            <Typography variant="h4" fontWeight="normal">
              <FormattedMessage id="common.withdrawable" />
            </Typography>
            <Typography variant="h4" fontWeight="normal">
              {Number(formatUnits(withdrawableCollateral, collateralDecimals)).toFixed(6)}{' '}
              {market.collateralAsset?.symbol || intl.formatMessage({ id: 'common.na' })}
            </Typography>
          </Box>
          <Divider sx={{ width: '100%', mx: 'auto', borderBottomWidth: 3 }} />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              backgroundColor: theme.palette.background.paper,
              margin: '20px 0 0 0'
            }}
          >
            <Typography variant="h4" fontWeight="normal">
              <FormattedMessage id="withdrawCollateral.safeWithdrawable" />
            </Typography>
            <Typography variant="h4" fontWeight="normal">
              {Number(formatUnits(safeWithdrawableCollateral, collateralDecimals)).toFixed(6)}{' '}
              {market.collateralAsset?.symbol || intl.formatMessage({ id: 'common.na' })}
            </Typography>
          </Box>
        </Box>
        <Box id="withdraw-collateral-status" role="alert" sx={visuallyHidden}>
          {statusMessage}
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleWithdraw}
          disabled={isButtonDisabled}
          sx={{
            height: '58px',
            width: '100%',
            marginTop: '20px',
            fontFamily: 'Roboto, Arial, sans-serif',
            fontSize: '18px',
            fontWeight: 700
          }}
        >
          {getButtonText()}
        </Button>
      </Box>
    </Box>
  );
}
