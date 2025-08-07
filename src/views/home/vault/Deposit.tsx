import Box from '@mui/material/Box';
import { Typography, Button, TextField, InputAdornment } from '@mui/material';
import React, { useState, useMemo, useEffect, useCallback, FC } from 'react';
import { Vault } from 'types/vaults';
import { useAccount, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatEther, formatUnits, parseEther } from 'viem';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useDebounce } from 'hooks/useDebounce';
import { useWriteTransaction } from 'hooks/useWriteTransaction';

interface DepositProps {
  vaultAddress: string;
  vaultData?: Vault;
}

const DepositTab: FC<DepositProps> = ({ vaultAddress, vaultData }) => {
  // Track when allowance checking is in progress (during debounce)
  const [allowanceChecking, setAllowanceChecking] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const { address: userAddress } = useAccount();
  const debouncedDepositAmount = useDebounce(depositAmount, 500);

  // Track process completion
  const [isApproved, setIsApproved] = useState(false);

  // Use transaction hooks
  const approveTx = useWriteTransaction();
  const depositTx = useWriteTransaction();

  // Check allowance to determine if approval is needed
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: vaultData?.asset.address as `0x${string}` | undefined,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, vaultAddress as `0x${string}`],
    query: {
      enabled: !!userAddress && !!vaultAddress && !!vaultData
    }
  });

  useEffect(() => {
    if (debouncedDepositAmount && refetchAllowance) {
      refetchAllowance();
      setAllowanceChecking(false); // Clear checking state when debounced value is processed
    }
  }, [debouncedDepositAmount, refetchAllowance]);

  useEffect(() => {
    if (depositAmount && depositAmount !== debouncedDepositAmount) {
      setAllowanceChecking(true); // Set checking state when amount changes
    }
  }, [depositAmount, debouncedDepositAmount]);

  // Check if approval is needed
  useEffect(() => {
    if (userAddress && debouncedDepositAmount && allowanceData && vaultAddress) {
      try {
        const amountBigInt = parseEther(debouncedDepositAmount);
        const shouldBeApproved = allowanceData >= amountBigInt;

        // Only update state if it's different to avoid unnecessary re-renders
        if (shouldBeApproved !== isApproved) {
          setIsApproved(shouldBeApproved);
        }
      } catch (error) {
        console.error('Error checking allowance:', error);
      }
    }
  }, [userAddress, debouncedDepositAmount, allowanceData, isApproved, vaultAddress]);

  // Read user's token balance
  const { data: tokenBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: vaultData?.asset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!vaultData
    }
  });

  // Format balances for display
  const formattedTokenBalance = useMemo(() => {
    if (!tokenBalance || !vaultData) return '0';
    return formatUnits(tokenBalance as bigint, vaultData.asset.decimals);
  }, [tokenBalance, vaultData]);

  const rawTokenBalance = useMemo(() => {
    if (!tokenBalance || !vaultData) return '0';
    return tokenBalance;
  }, [tokenBalance, vaultData]);

  // Reset transaction states
  const resetTransactionStates = useCallback(() => {
    approveTx.resetTx();
    depositTx.resetTx();
  }, [approveTx, depositTx]);

  useEffect(() => {
    if (depositTx.txState == 'confirmed') {
      resetTransactionStates();
    }
  }, [depositTx, depositTx.txState, resetTransactionStates]);

  // Handle percentage button clicks
  const handleDepositPercentClick = useCallback(
    (percent: number) => {
      const value = (Number(formatEther(BigInt(rawTokenBalance))) * percent) / 100;
      setDepositAmount(value.toString());

      if (depositAmount !== debouncedDepositAmount) {
        setAllowanceChecking(true);
      }
      resetTransactionStates();
      setIsApproved(false);
    },
    [rawTokenBalance, depositAmount, debouncedDepositAmount, resetTransactionStates]
  );

  // Handle success/error notifications and update states
  useEffect(() => {
    if (approveTx.txState === 'confirmed') {
      // Update approval status when confirmed
      setIsApproved(true);

      // Refresh allowance data to confirm
      if (refetchAllowance) {
        refetchAllowance();
      }

      dispatchSuccess(`${vaultData?.asset.symbol || 'Token'} approved successfully`);
      console.log('Approval confirmed!');
    } else if (approveTx.txState === 'error') {
      dispatchError(`Failed to approve ${vaultData?.asset.symbol || 'token'}`);
      setTxError(`Approval failed. Please try again.`);
      console.error('Approval transaction failed');
    } else if (approveTx.txState === 'submitted') {
      console.log('Approval transaction submitted');
    }
  }, [approveTx.txState, vaultData?.asset.symbol, refetchAllowance]);

  useEffect(() => {
    if (depositTx.txState === 'confirmed') {
      // Clear input and update states
      setDepositAmount('');

      // Show success message
      dispatchSuccess(`${vaultData?.asset.symbol || 'Tokens'} deposited successfully`);
      console.log('Deposit confirmed!');

      // After successful deposit, we might want to refresh any balances
      if (refetchAllowance) {
        refetchAllowance();
      }
    } else if (depositTx.txState === 'error') {
      dispatchError(`Failed to deposit ${vaultData?.asset.symbol || 'token'}`);
      setTxError(`Deposit failed. Please try again.`);
      console.error('Deposit transaction failed');
    } else if (depositTx.txState === 'submitted') {
      console.log('Deposit transaction submitted');
    }
  }, [depositTx.txState, vaultData?.asset.symbol, refetchAllowance]);

  const handleDeposit = useCallback(async () => {
    if (!userAddress || !vaultAddress || !depositAmount || parseFloat(depositAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!vaultData) {
      setTxError('Vault data not available');
      return;
    }

    // Reset error states if trying again
    console.log('Resetting transaction states...');
    console.log(depositTx.txState);
    if (approveTx.txState === 'error' || depositTx.txState === 'error') {
      if (approveTx.txState === 'error') {
        console.log('Resetting approval transaction state...');
        console.log(approveTx.txState);
        approveTx.resetTx();
      }
      if (depositTx.txState === 'error') {
        console.log('Resetting deposit transaction state...');
        console.log(depositTx.txState);
        depositTx.resetTx();
      }
    }

    const assetAddress = vaultData.asset.address;
    const assetDecimals = vaultData.asset.decimals;

    // Round down the amount to ensure we don't try to use more tokens than available
    const amountFloat = parseFloat(depositAmount);
    const multiplier = Math.pow(10, assetDecimals);
    const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;

    // Calculate amount with decimals
    const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    console.log('Attempting transaction with amount:', roundedAmount, 'Wei:', amountBN.toString());
    console.log('Current states - Approved:', isApproved);
    console.log(approveTx.isCompleted, vaultAddress, userAddress, depositAmount, !depositTx.isCompleted);
    try {
      // Step 1: Approve tokens if not already approved
      if (!isApproved) {
        console.log('Initiating approve transaction...');
        await approveTx.sendTransaction({
          abi: erc20ABIConfig.abi,
          address: assetAddress as `0x${string}`,
          functionName: 'approve',
          args: [vaultAddress as `0x${string}`, amountBN]
        });
      }
      // Step 2: Deposit tokens if already approved
      else if (isApproved && vaultData && vaultAddress && userAddress && depositAmount && !depositTx.isCompleted) {
        console.log('Initiating deposit transaction...');
        await depositTx.sendTransaction({
          abi: vaultConfig.abi,
          address: vaultAddress as `0x${string}`,
          functionName: 'deposit',
          args: [amountBN, userAddress as `0x${string}`]
        });
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      if (!isApproved) {
        dispatchError(`Failed to approve ${vaultData.asset.symbol}`);
      } else {
        dispatchError(`Failed to deposit ${vaultData.asset.symbol}`);
      }
      resetTransactionStates();
      setTxError(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [userAddress, vaultAddress, depositAmount, vaultData, depositTx, approveTx, isApproved]);

  // Check if any transaction is in progress
  const isTransactionInProgress =
    approveTx.txState === 'submitting' ||
    approveTx.txState === 'submitted' ||
    depositTx.txState === 'submitting' ||
    depositTx.txState === 'submitted';

  // Get button text based on transaction states
  const getButtonText = useCallback(() => {
    // Show checking status when amount is being debounced
    if (allowanceChecking) {
      return 'Checking allowance...';
    }

    if (!depositAmount) {
      return 'Enter Amount';
    }

    if (!isApproved) {
      if (approveTx.txState === 'submitting' || approveTx.txState === 'submitted') {
        return 'Approving...';
      }
      if (approveTx.txState === 'error') {
        return 'Approval Failed - Try again';
      }
      return `Approve ${vaultData?.asset.symbol || ''}`;
    }

    if (depositTx.txState === 'submitting' || depositTx.txState === 'submitted') {
      return 'Depositing...';
    }
    if (depositTx.txState === 'error') {
      return 'Deposit Failed - Try again';
    }

    return 'Deposit';
  }, [depositAmount, isApproved, allowanceChecking, approveTx.txState, depositTx.txState, vaultData?.asset.symbol]);

  // Determine if button should be disabled
  const isButtonDisabled = useCallback(() => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return true;

    // Disable during allowance checking (debounce period)
    if (allowanceChecking) return true;

    // Disable during transactions
    if (isTransactionInProgress) return true;
  }, [depositAmount, allowanceChecking, isTransactionInProgress]);

  // Determine if input and percentage buttons should be disabled
  const isInputDisabled = isTransactionInProgress;

  if (!vaultData) {
    return <Box>Incorrect Vault Data</Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Balance: {formattedTokenBalance} {vaultData.asset.symbol || vaultData.symbol}
        </Typography>
      </Box>
      <TextField
        label="Deposit Amount"
        variant="outlined"
        type="number"
        fullWidth
        value={depositAmount}
        onChange={(e) => setDepositAmount(e.target.value)}
        disabled={isInputDisabled}
        InputProps={{
          endAdornment: <InputAdornment position="end">{vaultData.asset.symbol || vaultData.symbol}</InputAdornment>
        }}
      />
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(25)} disabled={isInputDisabled}>
          25%
        </Button>
        <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(50)} disabled={isInputDisabled}>
          50%
        </Button>
        <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(75)} disabled={isInputDisabled}>
          75%
        </Button>
        <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(100)} disabled={isInputDisabled}>
          Max
        </Button>
      </Box>
      {txError && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {txError}
        </Typography>
      )}
      <Button variant="contained" color="primary" onClick={handleDeposit} disabled={isButtonDisabled()}>
        {getButtonText()}
      </Button>
    </Box>
  );
};

export default DepositTab;
