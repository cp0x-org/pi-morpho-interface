import Box from '@mui/material/Box';
import { Typography, TextField, InputAdornment } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useMemo, useState, useEffect } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { useWriteTransaction } from 'hooks/useWriteTransaction';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';

interface WithdrawTabProps {
  market: MarketInterface;
  accrualPosition: AccrualPosition | null;
  uniqueKey: string;
  onSuccess?: () => void;
}

export default function WithdrawTab({ market, accrualPosition, uniqueKey, onSuccess }: WithdrawTabProps) {
  // Internal state management
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  // Use the custom transaction hook
  const { sendTransaction, txState, txError, isCompleted, resetTx } = useWriteTransaction();

  const formattedWithdrawableCollateral = useMemo(() => {
    if (!accrualPosition?.withdrawableCollateral) return '0';
    return formatUnits(
      accrualPosition?.withdrawableCollateral as bigint,
      market?.collateralAsset?.decimals ? market.collateralAsset.decimals : 0
    );
  }, [accrualPosition, market]);

  // Handle successful transaction completion
  useEffect(() => {
    if (isCompleted && txState === 'confirmed') {
      dispatchSuccess(`Successfully withdrew ${withdrawAmount} ${market.collateralAsset.symbol}`);
      setWithdrawAmount('');

      // Call onSuccess to refresh the position data
      if (onSuccess) {
        onSuccess();
      }

      resetTx();
    }
  }, [isCompleted, txState, withdrawAmount, market.collateralAsset.symbol, onSuccess, resetTx]);

  // Handle transaction errors
  useEffect(() => {
    if (txState === 'error' && txError) {
      dispatchError(`Failed to withdraw: ${txError.message || txError.name}`);
    }
  }, [txState, txError]);

  // Handle withdraw collateral
  const handleWithdraw = async () => {
    if (!userAddress || !uniqueKey || !withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      return;
    }

    if (!market) {
      dispatchError('Market Not Found');
      return;
    }

    const assetDecimals = market.collateralAsset.decimals;

    // Calculate amount with decimals
    const amountBN = parseUnits(withdrawAmount, assetDecimals);

    try {
      // Execute transaction using the custom hook
      await sendTransaction({
        address: chainConfig.contracts.Morpho as `0x${string}`,
        abi: morphoContractConfig.abi,
        functionName: 'withdrawCollateral',
        args: [
          {
            loanToken: market.loanAsset.address as `0x${string}`,
            collateralToken: market.collateralAsset.address as `0x${string}`,
            oracle: market.oracleAddress as `0x${string}`,
            irm: market.irmAddress as `0x${string}`,
            lltv: BigInt(market.lltv)
          },
          amountBN,
          userAddress as `0x${string}`,
          userAddress as `0x${string}`
        ]
      });
    } catch (error) {
      console.error('Error withdrawing collateral:', error);
      dispatchError(`Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Determine if the button should be disabled
  const isButtonDisabled =
    !withdrawAmount ||
    parseFloat(withdrawAmount) <= 0 ||
    parseFloat(withdrawAmount) > parseFloat(formattedWithdrawableCollateral) ||
    txState === 'submitting' ||
    txState === 'submitted';

  // Determine button text based on transaction state
  const getButtonText = () => {
    switch (txState) {
      case 'submitting':
        return 'Preparing Transaction...';
      case 'submitted':
        return 'Withdrawing...';
      default:
        return 'Withdraw';
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary">
          Withdraw Collateral {market.collateralAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <TextField
        label="Withdraw Amount"
        variant="outlined"
        type="number"
        fullWidth
        value={withdrawAmount}
        onChange={(e) => setWithdrawAmount(e.target.value)}
        InputProps={{
          endAdornment: <InputAdornment position="end">{market.collateralAsset?.symbol || 'N/A'}</InputAdornment>
        }}
        disabled={txState === 'submitting' || txState === 'submitted'}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Withdrawable: {formattedWithdrawableCollateral} {market.collateralAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.25).toString())}
          disabled={txState === 'submitting' || txState === 'submitted'}
        >
          25%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.5).toString())}
          disabled={txState === 'submitting' || txState === 'submitted'}
        >
          50%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.75).toString())}
          disabled={txState === 'submitting' || txState === 'submitted'}
        >
          75%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setWithdrawAmount(formattedWithdrawableCollateral)}
          disabled={txState === 'submitting' || txState === 'submitted'}
        >
          Max
        </Button>
      </Box>
      {txError && txState === 'error' && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {txError.message || 'An error occurred while processing your transaction'}
        </Typography>
      )}
      <Button variant="contained" color="primary" onClick={handleWithdraw} disabled={isButtonDisabled}>
        {getButtonText()}
      </Button>
    </Box>
  );
}
