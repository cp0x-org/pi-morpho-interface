import Box from '@mui/material/Box';
import { Typography, TextField, InputAdornment } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useMemo, useState } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { dispatchError } from 'utils/snackbar';

interface BorrowTabProps {
  market: MarketInterface;
  accrualPosition: AccrualPosition | null;
  onSuccess?: () => void;
}

export default function BorrowTab({ market, accrualPosition, onSuccess }: BorrowTabProps) {
  const [borrowAmount, setBorrowAmount] = useState<string>('');
  const [txError, setTxError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  // Set up transaction contract write
  const { writeContract: writeTransaction, data: transactionData } = useWriteContract({
    mutation: {
      onError(error) {
        console.error('Transaction error:', error);
        setTxError(`Transaction failed: ${error.name}`);
        setIsProcessing(false);
        dispatchError('Cannot send transaction.' + error.name);
      }
    }
  });

  // Wait for main transaction
  const { isLoading: isTransactionLoading, isSuccess: isTransactionSuccess } = useWaitForTransactionReceipt({ hash: transactionData });

  // Reset form after successful transaction
  React.useEffect(() => {
    if (isTransactionSuccess) {
      setBorrowAmount('');
      setIsProcessing(false);
      if (onSuccess) {
        onSuccess();
      }
    }
  }, [isTransactionSuccess, onSuccess]);

  const formattedMaxBorrowable = useMemo(() => {
    if (!accrualPosition?.maxBorrowableAssets) return '0';
    return formatUnits(accrualPosition?.maxBorrowableAssets as bigint, market?.loanAsset?.decimals ? market.loanAsset.decimals : 0);
  }, [accrualPosition, market]);

  // Handle borrow loan asset
  const handleBorrow = async () => {
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
      // console.log('BORROW PARAMS');
      //
      // console.log([
      //   {
      //     loanToken: market.loanAsset.address as `0x${string}`,
      //     collateralToken: market.collateralAsset.address as `0x${string}`,
      //     oracle: market.oracleAddress as `0x${string}`,
      //     irm: market.irmAddress as `0x${string}`,
      //     lltv: BigInt(market.lltv)
      //   },
      //   amountBN,
      //   0n,
      //   userAddress as `0x${string}`,
      //   userAddress as `0x${string}`
      // ]);
      setIsProcessing(true);

      writeTransaction({
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
      setTxError(`Failed to borrow: ${error instanceof Error ? error.name : ''}`);
      setIsProcessing(false);
    }
  };

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
        InputProps={{
          endAdornment: <InputAdornment position="end">{market.loanAsset?.symbol || 'N/A'}</InputAdornment>
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Borrowable: {formattedMaxBorrowable} {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="outlined" size="small" onClick={() => setBorrowAmount((parseFloat(formattedMaxBorrowable) * 0.25).toString())}>
          25%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setBorrowAmount((parseFloat(formattedMaxBorrowable) * 0.5).toString())}>
          50%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setBorrowAmount((parseFloat(formattedMaxBorrowable) * 0.75).toString())}>
          75%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setBorrowAmount(formattedMaxBorrowable)}>
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
          parseFloat(borrowAmount) > parseFloat(formattedMaxBorrowable) ||
          isProcessing ||
          isTransactionLoading
        }
      >
        {isProcessing || isTransactionLoading ? 'Borrowing...' : 'Borrow'}
      </Button>
    </Box>
  );
}
