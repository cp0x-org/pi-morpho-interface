import Box from '@mui/material/Box';
import { Typography, TextField, InputAdornment } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useState, useMemo, useEffect, useCallback, FC } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useDebounce } from 'hooks/useDebounce';
import { useWriteTransaction } from 'hooks/useWriteTransaction';

interface RepayTabProps {
  market: MarketInterface;
  accrualPosition: AccrualPosition | null;
  uniqueKey: string;
  onSuccess?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

const RepayTab: FC<RepayTabProps> = ({ market, accrualPosition, uniqueKey, onBorrowAmountChange, onSuccess }) => {
  // State for input and transactions
  const [repayAmount, setRepayAmount] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const [allowanceChecking, setAllowanceChecking] = useState(false);
  const debouncedRepayAmount = useDebounce(repayAmount, 500);
  const [isApproved, setIsApproved] = useState(false);

  // Hooks
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  // Transaction hooks
  const approveTx = useWriteTransaction();
  const repayTx = useWriteTransaction();

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

  // Format balances for display
  const formattedLoanBalance = useMemo(() => {
    if (!accrualPosition?.borrowAssets) return '0';
    return formatUnits(accrualPosition?.borrowAssets as bigint, market?.loanAsset?.decimals ? market?.loanAsset?.decimals : 0);
  }, [accrualPosition?.borrowAssets, market]);

  const formattedUserBalance = useMemo(() => {
    if (!userBalance) return '0';
    return formatUnits(userBalance as bigint, market?.loanAsset?.decimals ? market?.loanAsset?.decimals : 0);
  }, [userBalance, market]);

  // Check allowance to determine if approval is needed
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: market?.loanAsset.address as `0x${string}` | undefined,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, chainConfig.contracts.Morpho as `0x${string}`],
    query: {
      enabled: !!userAddress && !!market?.loanAsset && !!chainConfig.contracts.Morpho
    }
  });

  useEffect(() => {
    console.log('Add debouncedAmount');
    if (!market) {
      console.log('Market data not available');
      return;
    }

    let amount = debouncedRepayAmount ? debouncedRepayAmount : '0';

    const amountFloat = parseFloat(amount);
    const assetDecimals = market.loanAsset.decimals;

    const multiplier = Math.pow(10, assetDecimals);
    const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    // Calculate amount with decimals
    const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    console.log('Amount:', roundedAmount, 'Wei:', amountBN.toString());

    onBorrowAmountChange(-amountBN);
  }, [debouncedRepayAmount, market]);

  // Refetch allowance when input amount changes
  useEffect(() => {
    if (debouncedRepayAmount && refetchAllowance) {
      refetchAllowance();
      setAllowanceChecking(false);
    }
  }, [debouncedRepayAmount, refetchAllowance]);

  // Set checking state when amount changes
  useEffect(() => {
    if (repayAmount && repayAmount !== debouncedRepayAmount) {
      setAllowanceChecking(true);
    }
  }, [repayAmount, debouncedRepayAmount]);

  // Check if approval is needed
  useEffect(() => {
    if (userAddress && debouncedRepayAmount && allowanceData && market?.loanAsset) {
      try {
        const amountBigInt = parseUnits(debouncedRepayAmount, market.loanAsset.decimals);
        const shouldBeApproved = allowanceData >= amountBigInt;

        // Only update state if it's different to avoid unnecessary re-renders
        if (shouldBeApproved !== isApproved) {
          setIsApproved(shouldBeApproved);
        }
      } catch (error) {
        console.error('Error checking allowance:', error);
      }
    }
  }, [userAddress, debouncedRepayAmount, allowanceData, isApproved, market]);

  // Reset transaction states
  const resetTransactionStates = useCallback(() => {
    approveTx.resetTx();
    repayTx.resetTx();
  }, [approveTx, repayTx]);

  // Handle percentage button clicks
  const handlePercentClick = useCallback(
    (percent: number) => {
      const decimals = market?.loanAsset?.decimals || 0;
      const rawValue = (parseFloat(formattedLoanBalance) * percent) / 100;
      const factor = 10 ** decimals;
      const value = Math.floor(rawValue * factor) / factor;

      // const value = ((parseFloat(formattedLoanBalance) * percent) / 100).toFixed(market?.loanAsset?.decimals);
      setRepayAmount(value.toString());

      if (repayAmount !== debouncedRepayAmount) {
        setAllowanceChecking(true);
      }
      resetTransactionStates();
      setIsApproved(false);
    },
    [formattedLoanBalance, repayAmount, debouncedRepayAmount, resetTransactionStates]
  );

  // Reset states when transaction is confirmed
  useEffect(() => {
    if (repayTx.txState === 'confirmed') {
      resetTransactionStates();
    }
  }, [repayTx.txState, resetTransactionStates]);

  // Handle approve transaction success/error
  useEffect(() => {
    if (approveTx.txState === 'confirmed') {
      // Update approval status when confirmed
      setIsApproved(true);

      // Refresh allowance data to confirm
      if (refetchAllowance) {
        refetchAllowance();
      }

      dispatchSuccess(`${market?.loanAsset.symbol || 'Token'} approved successfully`);
      console.log('Approval confirmed!');
    } else if (approveTx.txState === 'error') {
      dispatchError(`Failed to approve ${market?.loanAsset.symbol || 'token'}`);
      setTxError(`Approval failed. Please try again.`);
      console.error('Approval transaction failed');
    } else if (approveTx.txState === 'submitted') {
      console.log('Approval transaction submitted');
    }
  }, [approveTx.txState, market?.loanAsset.symbol, refetchAllowance]);

  // Handle repay transaction success/error
  useEffect(() => {
    if (repayTx.txState === 'confirmed') {
      // Clear input and update states
      setRepayAmount('');

      // Show success message
      dispatchSuccess(`${market?.loanAsset.symbol || 'Loan'} repaid successfully`);
      console.log('Repay loan confirmed!');

      // After successful transaction, we might want to refresh any balances
      if (refetchAllowance) {
        refetchAllowance();
      }

      if (onSuccess) {
        onSuccess();
      }
    } else if (repayTx.txState === 'error') {
      dispatchError(`Failed to repay ${market?.loanAsset.symbol || 'loan'}`);
      setTxError(`Repay loan failed. Please try again.`);
      console.error('Repay loan transaction failed');
    } else if (repayTx.txState === 'submitted') {
      console.log('Repay loan transaction submitted');
    }
  }, [repayTx.txState, market?.loanAsset.symbol, refetchAllowance, onSuccess]);

  // Handle repay loan
  const handleRepay = useCallback(async () => {
    if (!userAddress || !uniqueKey || !repayAmount || parseFloat(repayAmount) <= 0) {
      return;
    }

    setTxError(null);
    if (!market) {
      setTxError('Market data not available');
      return;
    }

    // Reset error states if trying again
    console.log('Resetting transaction states...');
    if (approveTx.txState === 'error' || repayTx.txState === 'error') {
      if (approveTx.txState === 'error') {
        approveTx.resetTx();
      }
      if (repayTx.txState === 'error') {
        repayTx.resetTx();
      }
    }

    const assetAddress = market.loanAsset.address;
    const marketAddress = chainConfig.contracts.Morpho;
    const assetDecimals = market.loanAsset.decimals;

    // Round down the amount to ensure we don't try to use more tokens than available
    const amountFloat = parseFloat(repayAmount);
    const multiplier = Math.pow(10, assetDecimals);
    const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;

    // Calculate amount with decimals
    const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    console.log('Attempting transaction with amount:', roundedAmount, 'Wei:', amountBN.toString());
    console.log('Current states - Approved:', isApproved);

    try {
      // Step 1: Approve tokens if not already approved
      if (!isApproved) {
        console.log('Initiating approve transaction...');
        await approveTx.sendTransaction({
          abi: erc20ABIConfig.abi,
          address: assetAddress as `0x${string}`,
          functionName: 'approve',
          args: [marketAddress as `0x${string}`, amountBN]
        });
      }
      // Step 2: Repay loan if already approved
      else if (isApproved && market && uniqueKey && userAddress && repayAmount && !repayTx.isCompleted) {
        console.log('Initiating repay loan transaction...');
        await repayTx.sendTransaction({
          address: chainConfig.contracts.Morpho,
          abi: morphoContractConfig.abi,
          functionName: 'repay',
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
            '' as `0x${string}`
          ]
        });
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      if (!isApproved) {
        dispatchError(`Failed to approve ${market.loanAsset.symbol}`);
      } else {
        dispatchError(`Failed to repay ${market.loanAsset.symbol} loan`);
      }
      resetTransactionStates();
      setTxError(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [userAddress, uniqueKey, repayAmount, market, isApproved, chainConfig, approveTx, repayTx, resetTransactionStates]);

  // Check if any transaction is in progress
  const isTransactionInProgress =
    approveTx.txState === 'submitting' ||
    approveTx.txState === 'submitted' ||
    repayTx.txState === 'submitting' ||
    repayTx.txState === 'submitted';

  // Get button text based on transaction states
  const getButtonText = useCallback(() => {
    // Show checking status when amount is being debounced
    if (allowanceChecking) {
      return 'Checking allowance...';
    }

    if (!repayAmount) {
      return 'Enter Amount';
    }

    if (!isApproved) {
      if (approveTx.txState === 'submitting' || approveTx.txState === 'submitted') {
        return 'Approving...';
      }
      if (approveTx.txState === 'error') {
        return 'Approval Failed - Try again';
      }
      return `Approve ${market?.loanAsset.symbol || ''}`;
    }

    if (repayTx.txState === 'submitting' || repayTx.txState === 'submitted') {
      return 'Repaying Loan...';
    }
    if (repayTx.txState === 'error') {
      return 'Repay Failed - Try again';
    }

    return 'Repay Loan';
  }, [repayAmount, isApproved, allowanceChecking, approveTx.txState, repayTx.txState, market?.loanAsset.symbol]);

  // Determine if button should be disabled
  const isButtonDisabled = useCallback(() => {
    if (!repayAmount || parseFloat(repayAmount) <= 0) return true;
    if (parseFloat(repayAmount) > parseFloat(formattedLoanBalance)) return true;
    if (parseFloat(repayAmount) > parseFloat(formattedUserBalance)) return true;

    // Disable during allowance checking (debounce period)
    if (allowanceChecking) return true;

    // Disable during transactions
    if (isTransactionInProgress) return true;

    return false;
  }, [repayAmount, formattedLoanBalance, formattedUserBalance, allowanceChecking, isTransactionInProgress]);

  // Determine if input and percentage buttons should be disabled
  const isInputDisabled = isTransactionInProgress;

  if (!market) {
    return <Box>Incorrect Market Data</Box>;
  }

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
        disabled={isInputDisabled}
        InputProps={{
          endAdornment: <InputAdornment position="end">{market.loanAsset?.symbol || 'N/A'}</InputAdornment>
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Loan: {Number(formattedLoanBalance).toFixed(6)} {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Typography variant="body2" color="text.secondary">
          Your Balance: {Number(formattedUserBalance).toFixed(6)} {market.loanAsset?.symbol || 'N/A'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="outlined" size="small" onClick={() => handlePercentClick(25)} disabled={isInputDisabled}>
          25%
        </Button>
        <Button variant="outlined" size="small" onClick={() => handlePercentClick(50)} disabled={isInputDisabled}>
          50%
        </Button>
        <Button variant="outlined" size="small" onClick={() => handlePercentClick(75)} disabled={isInputDisabled}>
          75%
        </Button>
        <Button variant="outlined" size="small" onClick={() => handlePercentClick(100)} disabled={isInputDisabled}>
          Max
        </Button>
      </Box>
      {txError && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {txError}
        </Typography>
      )}
      <Button variant="contained" color="primary" onClick={handleRepay} disabled={isButtonDisabled()}>
        {getButtonText()}
      </Button>
    </Box>
  );
};

export default RepayTab;
