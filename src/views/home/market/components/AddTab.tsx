import Box from '@mui/material/Box';
import { Typography, TextField, InputAdornment } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useMemo } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';

interface AddTabProps {
  market: MarketInterface;
  addAmount: string;
  setAddAmount: (amount: string) => void;
  txError: string | null;
  isApproving: boolean;
  isProcessing: boolean;
  isApprovalLoading: boolean;
  isTransactionLoading: boolean;
  setIsApproving: (isApproving: boolean) => void;
  setTxError: (error: string | null) => void;
  writeApprove: any;
  tabValue: number;
  uniqueKey: string;
}

export default function AddTab({
  market,
  addAmount,
  setAddAmount,
  txError,
  isApproving,
  isProcessing,
  isApprovalLoading,
  isTransactionLoading,
  setIsApproving,
  setTxError,
  writeApprove,
  tabValue,
  uniqueKey
}: AddTabProps) {
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  // Read user's collateral token balance
  const { data: collateralBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: market?.collateralAsset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!market?.collateralAsset
    }
  });
  // Format balances for display
  const formattedCollateralBalance = useMemo(() => {
    if (!collateralBalance) return '0';
    return formatUnits(collateralBalance as bigint, market?.collateralAsset?.decimals ? market.collateralAsset.decimals : 0);
  }, [collateralBalance, market]);

  // Handle add collateral
  const handleAddCollateral = async () => {
    if (!userAddress || !uniqueKey || !addAmount || parseFloat(addAmount) <= 0) {
      return;
    }

    setTxError(null);
    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      return;
    }
    try {
      const assetAddress = market?.collateralAsset.address;
      const marketAddress = chainConfig.contracts.Morpho;
      const assetDecimals = market?.collateralAsset.decimals;

      // Calculate amount with decimals
      const amountBN = parseUnits(addAmount, assetDecimals);

      // First approve tokens
      setIsApproving(true);
      writeApprove({
        abi: erc20ABIConfig.abi,
        address: assetAddress as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress as `0x${string}`, amountBN]
      });
    } catch (error) {
      console.error('Error approving tokens:', error);
      setTxError(`Failed to approve tokens: ${error instanceof Error ? error.name : ''}`);
      setIsApproving(false);
    }
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary">
          Supply Collateral {market.collateralAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <TextField
        label="Add Collateral Amount"
        variant="outlined"
        type="number"
        fullWidth
        value={addAmount}
        onChange={(e) => setAddAmount(e.target.value)}
        InputProps={{
          endAdornment: <InputAdornment position="end">{market.collateralAsset?.symbol || 'N/A'}</InputAdornment>
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Balance: {formattedCollateralBalance} {market.collateralAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="outlined" size="small" onClick={() => setAddAmount((parseFloat(formattedCollateralBalance) * 0.25).toString())}>
          25%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setAddAmount((parseFloat(formattedCollateralBalance) * 0.5).toString())}>
          50%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setAddAmount((parseFloat(formattedCollateralBalance) * 0.75).toString())}>
          75%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setAddAmount(formattedCollateralBalance)}>
          Max
        </Button>
      </Box>
      {txError && tabValue === 0 && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {txError}
        </Typography>
      )}
      <Button
        variant="contained"
        color="primary"
        onClick={handleAddCollateral}
        disabled={
          !addAmount ||
          parseFloat(addAmount) <= 0 ||
          parseFloat(addAmount) > parseFloat(formattedCollateralBalance) ||
          isApproving ||
          isProcessing ||
          isApprovalLoading ||
          isTransactionLoading
        }
      >
        {isApproving || isApprovalLoading ? 'Approving...' : isProcessing || isTransactionLoading ? 'Adding...' : 'Add Collateral'}
      </Button>
    </Box>
  );
}
