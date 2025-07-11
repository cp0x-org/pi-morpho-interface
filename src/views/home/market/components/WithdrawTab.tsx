import Box from '@mui/material/Box';
import { Typography, TextField, InputAdornment } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useMemo } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { AccrualPosition } from '@morpho-org/blue-sdk';

interface WithdrawTabProps {
  market: MarketInterface;
  accrualPosition: AccrualPosition | null;
  withdrawAmount: string;
  setWithdrawAmount: (amount: string) => void;
  txError: string | null;
  isProcessing: boolean;
  isTransactionLoading: boolean;
  setIsProcessing: (isProcessing: boolean) => void;
  setTxError: (error: string | null) => void;
  writeTransaction: any;
  tabValue: number;
  uniqueKey: string;
}

export default function WithdrawTab({
  market,
  accrualPosition,
  withdrawAmount,
  setWithdrawAmount,
  txError,
  isProcessing,
  isTransactionLoading,
  setIsProcessing,
  setTxError,
  writeTransaction,
  tabValue,
  uniqueKey
}: WithdrawTabProps) {
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  const formattedWithdrawableCollateral = useMemo(() => {
    if (!accrualPosition?.withdrawableCollateral) return '0';
    return formatUnits(
      accrualPosition?.withdrawableCollateral as bigint,
      market?.collateralAsset?.decimals ? market.collateralAsset.decimals : 0
    );
  }, [accrualPosition, market]);

  // Handle withdraw collateral
  const handleWithdraw = async () => {
    if (!userAddress || !uniqueKey || !withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      return;
    }

    const assetDecimals = market.collateralAsset.decimals;

    // Calculate amount with decimals
    const amountBN = parseUnits(withdrawAmount, assetDecimals);

    try {
      setIsProcessing(true);
      // Example function call - this would need to be replaced with actual contract method
      writeTransaction({
        address: chainConfig.contracts.Morpho as `0x${string}`,
        // This is a placeholder - replace with actual ABI and function
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
      setTxError(`Failed to withdraw: ${error instanceof Error ? error.name : String(error)}`);
      setIsProcessing(false);
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
        >
          25%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.5).toString())}
        >
          50%
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.75).toString())}
        >
          75%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setWithdrawAmount(formattedWithdrawableCollateral)}>
          Max
        </Button>
      </Box>
      {txError && tabValue === 3 && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {txError}
        </Typography>
      )}
      <Button
        variant="contained"
        color="primary"
        onClick={handleWithdraw}
        disabled={
          !withdrawAmount ||
          parseFloat(withdrawAmount) <= 0 ||
          parseFloat(withdrawAmount) > parseFloat(formattedWithdrawableCollateral) ||
          isProcessing ||
          isTransactionLoading
        }
      >
        {isProcessing || isTransactionLoading ? 'Withdrawing...' : 'Withdraw'}
      </Button>
    </Box>
  );
}
