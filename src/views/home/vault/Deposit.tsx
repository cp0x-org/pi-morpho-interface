import Box from '@mui/material/Box';
import { Typography, Button, TextField, InputAdornment, useTheme } from '@mui/material';
import React, { useState, useMemo, useEffect, useCallback, FC } from 'react';
import { Vault } from 'types/vaults';
import { useAccount, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatEther, formatUnits, parseEther } from 'viem';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useDebounce } from 'hooks/useDebounce';
import { useWriteTransaction } from 'hooks/useWriteTransaction';

import { parseUnits } from 'viem';
import { TokenIcon } from 'components/TokenIcon';
import { CustomInput } from 'components/CustomInput';
import { INPUT_DECIMALS } from '@/appconfig';
import { DECIMALS_SCALE_FACTOR, formatAssetOutput } from 'utils/formatters'; // или ethers.js

interface DepositProps {
  vaultAddress: string;
  vaultData?: Vault;
}

const DepositTab: FC<DepositProps> = ({ vaultAddress, vaultData }) => {
  // Track when allowance checking is in progress (during debounce)
  const theme = useTheme();
  const [inputAmount, setInputAmount] = useState('');
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const [allowanceChecking, setAllowanceChecking] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [formattedDepositAmount, setFormattedDepositAmount] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const { address: userAddress } = useAccount();
  const debouncedDepositAmount = useDebounce(depositAmount, 500);
  const [localBalance, setLocalBalance] = useState<bigint | undefined>(undefined);

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
    if (depositAmount && vaultData?.asset?.decimals) {
      try {
        // Parse the string value to BigInt before formatting
        const amountBN = parseUnits(depositAmount.replace(/\,/g, '.'), vaultData.asset.decimals);
        setFormattedDepositAmount(formatUnits(amountBN, vaultData.asset.decimals));
      } catch (error) {
        console.error('Error formatting deposit amount:', error);
        setFormattedDepositAmount('0');
      }
    } else {
      setFormattedDepositAmount('0');
    }
  }, [depositAmount, vaultData]);

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
        const amountBigInt = parseUnits(debouncedDepositAmount.replace(/\,/g, '.'), vaultData?.asset?.decimals || 18);
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
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: vaultData?.asset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!vaultData
    }
  });

  useEffect(() => {
    setLocalBalance(tokenBalance);
  }, [tokenBalance]);

  // Format balances for display
  const formattedTokenBalance = useMemo(() => {
    if (!localBalance || !vaultData) return '0';
    return formatUnits(localBalance as bigint, vaultData.asset.decimals);
  }, [localBalance, vaultData]);

  const rawTokenBalance = useMemo(() => {
    if (!localBalance || !vaultData) return '0';
    return localBalance;
  }, [localBalance, vaultData]);

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
      const rawValue = (BigInt(rawTokenBalance) * BigInt(percent)) / BigInt(100);
      const valueStr = formatUnits(rawValue, vaultData?.asset.decimals || 18);

      setDepositAmount(valueStr);
      setInputAmount(formatAssetOutput(Number(valueStr).toFixed(INPUT_DECIMALS).toString()));

      // Set active percentage
      setActivePercentage(percent);

      if (depositAmount !== debouncedDepositAmount) {
        setAllowanceChecking(true);
      }
      resetTransactionStates();
      setIsApproved(false);
    },
    [rawTokenBalance, depositAmount, debouncedDepositAmount, resetTransactionStates]
  );

  useEffect(() => {
    if (approveTx.txState === 'confirmed') {
      // Update approval status when confirmed in blockchain
      setIsApproved(true);

      // Refresh allowance data to confirm
      if (refetchAllowance) {
        refetchAllowance();
      }

      // Show success message only after blockchain confirmation
      dispatchSuccess(`${vaultData?.asset.symbol || 'Token'} approved successfully`);
      console.log('Approval confirmed in blockchain!');
    } else if (approveTx.txState === 'error') {
      dispatchError(`Failed to approve ${vaultData?.asset.symbol || 'token'}`);
      setTxError(`Approval failed. Please try again.`);
      console.error('Approval transaction failed');
    } else if (approveTx.txState === 'submitted') {
      console.log('Approval transaction submitted, waiting for blockchain confirmation...');
    }
  }, [approveTx.txState, vaultData?.asset.symbol, refetchAllowance]);

  // Handle deposit transaction states
  useEffect(() => {
    if (depositTx.txState === 'confirmed') {
      // Clear input and update states
      setDepositAmount('');
      setInputAmount('');

      // Reset active percentage button
      setActivePercentage(null);

      // Show success message only after blockchain confirmation
      dispatchSuccess(`${vaultData?.asset.symbol || 'Tokens'} deposited successfully`);
      console.log('Deposit confirmed in blockchain!');

      // After successful deposit, refresh balances
      if (refetchAllowance) {
        refetchAllowance();
      }

      // Refresh token balance
      refetchBalance();
    } else if (depositTx.txState === 'error') {
      dispatchError(`Failed to deposit ${vaultData?.asset.symbol || 'token'}`);
      setTxError(`Deposit failed. Please try again.`);
      console.error('Deposit transaction failed');
    } else if (depositTx.txState === 'submitted') {
      console.log('Deposit transaction submitted, waiting for blockchain confirmation...');
    }
  }, [depositTx.txState, vaultData?.asset.symbol, refetchAllowance, refetchBalance]);

  const handleDeposit = useCallback(async () => {
    if (!userAddress || !vaultAddress || !depositAmount) {
      return;
    }

    setTxError(null);

    if (!vaultData) {
      setTxError('Vault data not available');
      return;
    }

    try {
      const assetAddress = vaultData.asset.address;
      const assetDecimals = vaultData.asset.decimals;

      // переводим строку напрямую в BigInt (без float!)
      let amountBN: bigint;
      try {
        amountBN = parseUnits(depositAmount, assetDecimals);
      } catch {
        setTxError('Invalid amount');
        return;
      }

      if (amountBN <= 0n) return;

      // Step 1: Approve
      if (!isApproved) {
        console.log('Initiating approval transaction...');
        await approveTx.sendTransaction({
          abi: erc20ABIConfig.abi,
          address: assetAddress as `0x${string}`,
          functionName: 'approve',
          args: [vaultAddress as `0x${string}`, amountBN]
        });
        // Wait for approval to be confirmed before continuing
        // The confirmation will be handled in the useEffect hook
      }
      // Step 2: Deposit
      else if (!depositTx.isCompleted) {
        console.log('Initiating deposit transaction...');
        await depositTx.sendTransaction({
          abi: vaultConfig.abi,
          address: vaultAddress as `0x${string}`,
          functionName: 'deposit',
          args: [amountBN, userAddress as `0x${string}`]
        });
        // Refresh will be triggered after confirmation in useEffect
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      setTxError(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      resetTransactionStates();
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
      if (approveTx.txState === 'submitting') {
        return 'Sending Approval...';
      }
      if (approveTx.txState === 'submitted') {
        return 'Waiting for Approval Confirmation...';
      }
      if (approveTx.txState === 'error') {
        return 'Approval Failed - Try again';
      }
      return `Approve ${vaultData?.asset.symbol || ''}`;
    }

    if (depositTx.txState === 'submitting') {
      return 'Sending Deposit Transaction...';
    }
    if (depositTx.txState === 'submitted') {
      return 'Waiting for Blockchain Confirmation...';
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
              Deposit Asset
            </Typography>
            <Typography variant="body2">Deposit Amount:</Typography>
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
            {vaultData.asset.symbol && (
              <TokenIcon
                sx={{ width: '45px', height: '45px', display: 'flex', alignItems: 'center', zIndex: 1, marginBottom: '15px' }}
                avatarProps={{ sx: { width: 45, height: 45 } }}
                symbol={vaultData.asset.symbol}
              />
            )}
            <Typography fontWeight="bold">{vaultData.asset.symbol || 'N/A'}</Typography>
          </Box>
        </Box>
        <CustomInput
          autoFocus
          type="text"
          fullWidth
          value={inputAmount}
          onChange={(e) => {
            let val = formatAssetOutput(e.target.value);
            setDepositAmount(val);
            setInputAmount(val);
            // Clear active percentage when user manually enters a value
            if (activePercentage !== null) {
              setActivePercentage(null);
            }
          }}
          disabled={isInputDisabled}
          placeholder="0"
          inputProps={{ inputMode: 'decimal', pattern: '[0-9]*,?[0-9]*' }}
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
            onClick={() => handleDepositPercentClick(25)}
            disabled={isInputDisabled}
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
            onClick={() => handleDepositPercentClick(50)}
            disabled={isInputDisabled}
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
            onClick={() => handleDepositPercentClick(75)}
            disabled={isInputDisabled}
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
            onClick={() => handleDepositPercentClick(100)}
            disabled={isInputDisabled}
            sx={{
              flex: 1,
              bgcolor: activePercentage === 100 ? theme.palette.secondary.main : 'transparent',
              color: activePercentage === 100 ? theme.palette.background.paper : 'inherit'
            }}
          >
            Max
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
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            backgroundColor: theme.palette.background.paper,
            margin: '10px 0'
          }}
        >
          <Typography variant="h4" fontWeight="normal">
            Balance:
          </Typography>
          <Typography variant="h4" fontWeight="normal">
            {formatAssetOutput(Number(formattedTokenBalance).toFixed(vaultData.asset.decimals / DECIMALS_SCALE_FACTOR))}{' '}
            {vaultData.asset.symbol || 'N/A'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleDeposit}
          disabled={isButtonDisabled()}
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
};

export default DepositTab;
