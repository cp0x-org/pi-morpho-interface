import Box from '@mui/material/Box';
import { Typography, TextField, InputAdornment } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useState, useMemo, useEffect, useCallback, FC } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useDebounce } from 'hooks/useDebounce';
import { useWriteTransaction } from 'hooks/useWriteTransaction';

interface AddTabProps {
  market: MarketInterface;
  uniqueKey: string;
  onSuccess?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

const AddTab: FC<AddTabProps> = ({ market, uniqueKey, onSuccess, onCollateralAmountChange }) => {
  // Track when allowance checking is in progress (during debounce)
  const [allowanceChecking, setAllowanceChecking] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();
  const debouncedAddAmount = useDebounce(addAmount, 500);

  // Track process completion
  const [isApproved, setIsApproved] = useState(false);

  // Use transaction hooks
  const approveTx = useWriteTransaction();
  const addCollateralTx = useWriteTransaction();

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

  // Check allowance to determine if approval is needed
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: market?.collateralAsset.address as `0x${string}` | undefined,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, chainConfig.contracts.Morpho as `0x${string}`],
    query: {
      enabled: !!userAddress && !!market?.collateralAsset && !!chainConfig.contracts.Morpho
    }
  });

  useEffect(() => {
    console.log('Add debouncedAmount');
    if (!market) {
      console.log('Market data not available');
      return;
    }

    let amount = debouncedAddAmount ? debouncedAddAmount : '0';

    const amountFloat = parseFloat(amount);
    const assetDecimals = market.collateralAsset.decimals;

    const multiplier = Math.pow(10, assetDecimals);
    const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    // Calculate amount with decimals
    const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    console.log('Amount:', roundedAmount, 'Wei:', amountBN.toString());

    onCollateralAmountChange(amountBN);
  }, [debouncedAddAmount, market, onCollateralAmountChange]);

  useEffect(() => {
    if (debouncedAddAmount && refetchAllowance) {
      refetchAllowance();
      setAllowanceChecking(false); // Clear checking state when debounced value is processed
    }
  }, [debouncedAddAmount, refetchAllowance]);

  useEffect(() => {
    if (addAmount && addAmount !== debouncedAddAmount) {
      setAllowanceChecking(true); // Set checking state when amount changes
    }
  }, [addAmount, debouncedAddAmount]);

  // Check if approval is needed
  useEffect(() => {
    if (userAddress && debouncedAddAmount && allowanceData && market?.collateralAsset) {
      try {
        const amountBigInt = parseUnits(debouncedAddAmount, market.collateralAsset.decimals);
        const shouldBeApproved = allowanceData >= amountBigInt;

        // Only update state if it's different to avoid unnecessary re-renders
        if (shouldBeApproved !== isApproved) {
          setIsApproved(shouldBeApproved);
        }
      } catch (error) {
        console.error('Error checking allowance:', error);
      }
    }
  }, [userAddress, debouncedAddAmount, allowanceData, isApproved, market]);

  // Reset transaction states
  const resetTransactionStates = useCallback(() => {
    approveTx.resetTx();
    addCollateralTx.resetTx();
  }, [approveTx, addCollateralTx]);

  useEffect(() => {
    if (addCollateralTx.txState === 'confirmed') {
      resetTransactionStates();
    }
  }, [addCollateralTx, addCollateralTx.txState, resetTransactionStates]);

  // Handle percentage button clicks
  const handlePercentClick = useCallback(
    (percent: number) => {
      const value = (parseFloat(formattedCollateralBalance) * percent) / 100;
      setAddAmount(value.toString());

      if (addAmount !== debouncedAddAmount) {
        setAllowanceChecking(true);
      }
      resetTransactionStates();
      setIsApproved(false);
    },
    [formattedCollateralBalance, addAmount, debouncedAddAmount, resetTransactionStates]
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

      dispatchSuccess(`${market?.collateralAsset.symbol || 'Token'} approved successfully`);
      console.log('Approval confirmed!');
    } else if (approveTx.txState === 'error') {
      dispatchError(`Failed to approve ${market?.collateralAsset.symbol || 'token'}`);
      setTxError(`Approval failed. Please try again.`);
      console.error('Approval transaction failed');
    } else if (approveTx.txState === 'submitted') {
      console.log('Approval transaction submitted');
    }
  }, [approveTx.txState, market?.collateralAsset.symbol, refetchAllowance]);

  useEffect(() => {
    if (addCollateralTx.txState === 'confirmed') {
      // Clear input and update states
      setAddAmount('');

      // Show success message
      dispatchSuccess(`${market?.collateralAsset.symbol || 'Collateral'} added successfully`);
      console.log('Add collateral confirmed!');

      // After successful transaction, we might want to refresh any balances
      if (refetchAllowance) {
        refetchAllowance();
      }

      if (onSuccess) {
        onSuccess();
      }
    } else if (addCollateralTx.txState === 'error') {
      dispatchError(`Failed to add ${market?.collateralAsset.symbol || 'collateral'}`);
      setTxError(`Add collateral failed. Please try again.`);
      console.error('Add collateral transaction failed');
    } else if (addCollateralTx.txState === 'submitted') {
      console.log('Add collateral transaction submitted');
    }
  }, [addCollateralTx.txState, market?.collateralAsset.symbol, refetchAllowance, onSuccess]);

  const handleAddCollateral = useCallback(async () => {
    if (!userAddress || !uniqueKey || !debouncedAddAmount || parseFloat(debouncedAddAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!market) {
      setTxError('Market data not available');
      return;
    }

    // Reset error states if trying again
    console.log('Resetting transaction states...');
    if (approveTx.txState === 'error' || addCollateralTx.txState === 'error') {
      if (approveTx.txState === 'error') {
        approveTx.resetTx();
      }
      if (addCollateralTx.txState === 'error') {
        addCollateralTx.resetTx();
      }
    }

    const assetAddress = market.collateralAsset.address;
    const marketAddress = chainConfig.contracts.Morpho;
    const assetDecimals = market.collateralAsset.decimals;

    // Round down the amount to ensure we don't try to use more tokens than available
    const amountFloat = parseFloat(debouncedAddAmount);
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
      // Step 2: Add collateral if already approved
      else if (isApproved && market && uniqueKey && userAddress && debouncedAddAmount && !addCollateralTx.isCompleted) {
        console.log('Initiating add collateral transaction...');
        await addCollateralTx.sendTransaction({
          address: chainConfig.contracts.Morpho,
          abi: morphoContractConfig.abi,
          functionName: 'supplyCollateral',
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
            '' as `0x${string}`
          ]
        });
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      if (!isApproved) {
        dispatchError(`Failed to approve ${market.collateralAsset.symbol}`);
      } else {
        dispatchError(`Failed to add ${market.collateralAsset.symbol} collateral`);
      }
      resetTransactionStates();
      setTxError(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [userAddress, uniqueKey, debouncedAddAmount, market, isApproved, chainConfig, approveTx, addCollateralTx, resetTransactionStates]);

  // Check if any transaction is in progress
  const isTransactionInProgress =
    approveTx.txState === 'submitting' ||
    approveTx.txState === 'submitted' ||
    addCollateralTx.txState === 'submitting' ||
    addCollateralTx.txState === 'submitted';

  // Get button text based on transaction states
  const getButtonText = useCallback(() => {
    // Show checking status when amount is being debounced
    if (allowanceChecking) {
      return 'Checking allowance...';
    }

    if (!addAmount) {
      return 'Enter Amount';
    }

    if (!isApproved) {
      if (approveTx.txState === 'submitting' || approveTx.txState === 'submitted') {
        return 'Approving...';
      }
      if (approveTx.txState === 'error') {
        return 'Approval Failed - Try again';
      }
      return `Approve ${market?.collateralAsset.symbol || ''}`;
    }

    if (addCollateralTx.txState === 'submitting' || addCollateralTx.txState === 'submitted') {
      return 'Adding Collateral...';
    }
    if (addCollateralTx.txState === 'error') {
      return 'Add Failed - Try again';
    }

    return 'Add Collateral';
  }, [addAmount, isApproved, allowanceChecking, approveTx.txState, addCollateralTx.txState, market?.collateralAsset.symbol]);

  // Determine if button should be disabled
  const isButtonDisabled = useCallback(() => {
    if (!addAmount || parseFloat(addAmount) <= 0) return true;
    if (parseFloat(addAmount) > parseFloat(formattedCollateralBalance)) return true;

    // Disable during allowance checking (debounce period)
    if (allowanceChecking) return true;

    // Disable during transactions
    if (isTransactionInProgress) return true;

    return false;
  }, [addAmount, formattedCollateralBalance, allowanceChecking, isTransactionInProgress]);

  // Determine if input and percentage buttons should be disabled
  const isInputDisabled = isTransactionInProgress;

  if (!market) {
    return <Box>Incorrect Market Data</Box>;
  }

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
        disabled={isInputDisabled}
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
      <Button variant="contained" color="primary" onClick={handleAddCollateral} disabled={isButtonDisabled()}>
        {getButtonText()}
      </Button>
    </Box>
  );
};

export default AddTab;
