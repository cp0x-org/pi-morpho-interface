import Box from '@mui/material/Box';
import { InputAdornment, TextField, Typography } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useWriteTransaction } from 'hooks/useWriteTransaction';

interface BorrowTabProps {
  market: MarketInterface;
  accrualPosition: AccrualPosition | null;
  onSuccess?: () => void;
}

export default function BorrowTab({ market, accrualPosition, onSuccess }: BorrowTabProps) {
  const [borrowAmount, setBorrowAmount] = useState<string>('');
  const [txError, setTxError] = useState<string | null>(null);

  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  // Use the transaction hook
  const borrowTx = useWriteTransaction();

  const formattedMaxBorrowable = useMemo(() => {
    if (!accrualPosition?.maxBorrowableAssets) return '0';

    return formatUnits(accrualPosition?.maxBorrowableAssets as bigint, market?.loanAsset?.decimals ? market.loanAsset.decimals : 0);
  }, [accrualPosition, market]);

  const formattedSafeMaxBorrowable = useMemo(() => {
    if (!accrualPosition?.maxBorrowableAssets) return '0';

    let borrowable = formatUnits(
      accrualPosition?.maxBorrowableAssets as bigint,
      market?.loanAsset?.decimals ? market.loanAsset.decimals : 0
    );

    let safeBorrowable = Number(borrowable) * 0.94; // 6% safety margin

    return safeBorrowable.toFixed(4);
  }, [accrualPosition, market]);

  // Handle transaction state changes
  useEffect(() => {
    if (borrowTx.txState === 'confirmed') {
      setBorrowAmount('');
      dispatchSuccess(`${market.loanAsset?.symbol || 'Tokens'} borrowed successfully`);
      if (onSuccess) {
        onSuccess();
      }
      borrowTx.resetTx();
    } else if (borrowTx.txState === 'error') {
      setTxError(`Transaction failed`);
      dispatchError(`Cannot borrow ${market.loanAsset?.symbol || 'tokens'}: 'Transaction failed'}`);
    }
  }, [borrowTx.txState, borrowTx.txError, borrowTx.resetTx, market.loanAsset?.symbol, onSuccess, borrowTx]);

  // Handle borrow loan asset
  const handleBorrow = useCallback(async () => {
    if (!userAddress || !market.uniqueKey || !borrowAmount || parseFloat(borrowAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      return;
    }

    try {
      const assetDecimals = market.loanAsset.decimals;

      // Calculate amount with decimals
      const amountBN = parseUnits(borrowAmount, assetDecimals);

      await borrowTx.sendTransaction({
        address: chainConfig.contracts.Morpho as `0x${string}`,
        abi: morphoContractConfig.abi,
        functionName: 'borrow',
        args: [
          {
            loanToken: market.loanAsset.address as `0x${string}`,
            collateralToken: market.collateralAsset.address as `0x${string}`,
            oracle: market.oracleAddress as `0x${string}`,
            irm: market.irmAddress as `0x${string}`,
            lltv: BigInt(market.lltv)
          },
          amountBN,
          0n,
          userAddress as `0x${string}`,
          userAddress as `0x${string}`
        ]
      });
    } catch (error) {
      console.error('Error borrowing tokens:', error);
      setTxError(`Failed to borrow: ${error instanceof Error ? error.message : ''}`);
    }
  }, [userAddress, market, borrowAmount, borrowTx, chainConfig.contracts.Morpho]);

  // Check if transaction is in progress
  const isTransactionInProgress = borrowTx.txState === 'submitting' || borrowTx.txState === 'submitted';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary">
          Borrow {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <TextField
        label="Borrow Amount"
        variant="outlined"
        type="number"
        fullWidth
        value={borrowAmount}
        onChange={(e) => setBorrowAmount(e.target.value)}
        disabled={isTransactionInProgress}
        InputProps={{
          endAdornment: <InputAdornment position="end">{market.loanAsset?.symbol || 'N/A'}</InputAdornment>
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Max Borrowable: {formattedMaxBorrowable} {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Safe Borrowable: {formattedSafeMaxBorrowable} {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setBorrowAmount((parseFloat(formattedSafeMaxBorrowable) * 0.25).toString())}
          disabled={isTransactionInProgress}
        >
          25%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setBorrowAmount((parseFloat(formattedSafeMaxBorrowable) * 0.5).toString())}
          disabled={isTransactionInProgress}
        >
          50%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setBorrowAmount((parseFloat(formattedSafeMaxBorrowable) * 0.75).toString())}
          disabled={isTransactionInProgress}
        >
          75%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setBorrowAmount(formattedSafeMaxBorrowable)}
          disabled={isTransactionInProgress}
        >
          Max
        </Button>
      </Box>
      {txError && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {txError}
        </Typography>
      )}
      <Button
        variant="contained"
        color="primary"
        onClick={handleBorrow}
        disabled={
          !borrowAmount ||
          parseFloat(borrowAmount) <= 0 ||
          parseFloat(borrowAmount) > parseFloat(formattedSafeMaxBorrowable) ||
          isTransactionInProgress
        }
      >
        {borrowTx.txState === 'submitting' ? 'Preparing...' : borrowTx.txState === 'submitted' ? 'Borrowing...' : 'Borrow'}
      </Button>
    </Box>
  );
}
