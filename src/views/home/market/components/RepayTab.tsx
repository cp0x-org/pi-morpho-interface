import Box from '@mui/material/Box';
import { Typography, TextField, InputAdornment } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useMemo } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { AccrualPosition } from '@morpho-org/blue-sdk';

interface RepayTabProps {
  market: MarketInterface;
  repayAmount: string;
  setRepayAmount: (amount: string) => void;
  txError: string | null;
  isApproving: boolean;
  isProcessing: boolean;
  isApprovalLoading: boolean;
  isTransactionLoading: boolean;
  setIsApproving: (isApproving: boolean) => void;
  setTxError: (error: string | null) => void;
  writeApprove: any;
  tabValue: number;
  accrualPosition: AccrualPosition | null;
  uniqueKey: string;
}

export default function RepayTab({
  market,
  repayAmount,
  accrualPosition,
  setRepayAmount,
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
}: RepayTabProps) {
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  // Read user's loan token balance
  const { data: userBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: market?.loanAsset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!market?.loanAsset
    }
  });

  const formattedLoanBalance = useMemo(() => {
    if (!accrualPosition?.borrowAssets) return '0';
    return formatUnits(accrualPosition?.borrowAssets as bigint, market?.loanAsset?.decimals ? market?.loanAsset?.decimals : 0);
  }, [accrualPosition?.borrowAssets, market]);

  const formattedUserBalance = useMemo(() => {
    if (!userBalance) return '0';
    return formatUnits(userBalance as bigint, market?.loanAsset?.decimals ? market?.loanAsset?.decimals : 0);
  }, [userBalance, market]);

  // Handle repay loan
  const handleRepay = async () => {
    if (!userAddress || !uniqueKey || !repayAmount || parseFloat(repayAmount) <= 0) {
      return;
    }

    setTxError(null);
    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      return;
    }

    try {
      const assetAddress = market.loanAsset.address;
      const marketAddress = chainConfig.contracts.Morpho;
      const assetDecimals = market.loanAsset.decimals;

      // Calculate amount with decimals
      const amountBN = parseUnits(repayAmount, assetDecimals);

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
          Repay Loan {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <TextField
        label="Repay Amount"
        variant="outlined"
        type="number"
        fullWidth
        value={repayAmount}
        onChange={(e) => setRepayAmount(e.target.value)}
        InputProps={{
          endAdornment: <InputAdornment position="end">{market.loanAsset?.symbol || 'N/A'}</InputAdornment>
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Loan: {formattedLoanBalance} {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Your Balance: {formattedUserBalance} {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="outlined" size="small" onClick={() => setRepayAmount((parseFloat(formattedLoanBalance) * 0.25).toString())}>
          25%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setRepayAmount((parseFloat(formattedLoanBalance) * 0.5).toString())}>
          50%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setRepayAmount((parseFloat(formattedLoanBalance) * 0.75).toString())}>
          75%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setRepayAmount(formattedLoanBalance)}>
          Max
        </Button>
      </Box>
      {txError && tabValue === 2 && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {txError}
        </Typography>
      )}
      <Button
        variant="contained"
        color="primary"
        onClick={handleRepay}
        disabled={
          !repayAmount ||
          parseFloat(repayAmount) <= 0 ||
          parseFloat(repayAmount) > parseFloat(formattedLoanBalance) ||
          isApproving ||
          isProcessing ||
          isApprovalLoading ||
          isTransactionLoading
        }
      >
        {isApproving || isApprovalLoading ? 'Approving...' : isProcessing || isTransactionLoading ? 'Repaying...' : 'Repay Loan'}
      </Button>
    </Box>
  );
}
