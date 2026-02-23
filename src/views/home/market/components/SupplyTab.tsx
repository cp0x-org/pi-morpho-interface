import Box from '@mui/material/Box';
import { Typography } from '@mui/material';
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
import { TokenIcon } from 'components/TokenIcon';
import { useTheme } from '@mui/material/styles';
import { INPUT_DECIMALS } from '@/appconfig';
import { CustomInput } from 'components/CustomInput';
import { formatAssetOutput, normalizePointAmount } from 'utils/formatters';

interface SupplyTabProps {
  market: MarketInterface;
  uniqueKey: string;
  onSuccess?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}
// accrualPosition.supplyShares, marketSdk.toSupplyShares/ toSupplyAssets...
const SupplyTab: FC<SupplyTabProps> = ({ market, uniqueKey, onSuccess, onCollateralAmountChange }) => {
  const theme = useTheme();
  // Track when allowance checking is in progress (during debounce)
  const [allowanceChecking, setAllowanceChecking] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();
  const debouncedAddAmount = useDebounce(addAmount, 500);

  // Track process completion
  const [isApproved, setIsApproved] = useState(false);

  // Use transaction hooks
  const approveTx = useWriteTransaction();
  const supplyTx = useWriteTransaction();

  // Read user's loan token balance
  const { data: loanBalance } = useReadContract({
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
    if (!loanBalance) return '0';
    return formatUnits(loanBalance as bigint, market?.loanAsset?.decimals ? market.loanAsset.decimals : 0);
  }, [loanBalance, market]);

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
    if (!market) {
      console.log('Market data not available');
      return;
    }

    let amount = addAmount ? normalizePointAmount(addAmount) : '0';

    const assetDecimals = market.loanAsset.decimals;
    const amountBN = parseUnits(amount, assetDecimals);
    // const amountFloat = parseFloat(amount);
    // const multiplier = Math.pow(10, assetDecimals);
    // const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    // Calculate amount with decimals
    // const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    onCollateralAmountChange(amountBN);
  }, [addAmount, market, onCollateralAmountChange]);

  useEffect(() => {
    if (debouncedAddAmount && refetchAllowance) {
      refetchAllowance();
      setAllowanceChecking(false); // Clear checking state when debounced value is processed
    }
  }, [debouncedAddAmount, refetchAllowance]);

  const safeDecimal = (value: string, decimals: number) => {
    const floatValue = parseFloat(normalizePointAmount(value));
    if (floatValue === 0) return '0';
    // используем toFixed с количеством знаков >= decimals
    return floatValue.toFixed(decimals);
  };
  useEffect(() => {
    if (addAmount && addAmount !== debouncedAddAmount) {
      setAllowanceChecking(true); // Set checking state when amount changes
    }
  }, [addAmount, debouncedAddAmount]);

  // Check if approval is needed
  useEffect(() => {
    if (userAddress && debouncedAddAmount && allowanceData !== undefined && market?.loanAsset) {
      try {
        const amountStr = safeDecimal(normalizePointAmount(debouncedAddAmount), market.loanAsset.decimals);
        const amountBN = parseUnits(amountStr, market.loanAsset.decimals);
        const shouldBeApproved = allowanceData >= amountBN;

        // Only update state if it's different to avoid unnecessary re-renders
        if (shouldBeApproved !== isApproved) {
          console.log('Checking, allowanceData:', allowanceData);
          console.log('Checking, amountBN:', amountBN);
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
    supplyTx.resetTx();
  }, [approveTx, supplyTx]);

  useEffect(() => {
    if (supplyTx.txState === 'confirmed') {
      resetTransactionStates();
    }
  }, [supplyTx, supplyTx.txState, resetTransactionStates]);

  // Handle percentage button clicks
  const handlePercentClick = useCallback(
    (percent: number) => {
      const value = (parseFloat(formattedLoanBalance) * percent) / 100;
      setAddAmount(value.toString());
      setInputAmount(formatAssetOutput(value.toFixed(INPUT_DECIMALS).toString()));

      // Set active percentage
      setActivePercentage(percent);

      if (addAmount !== debouncedAddAmount) {
        setAllowanceChecking(true);
      }
      resetTransactionStates();
      setIsApproved(false);
    },
    [formattedLoanBalance, addAmount, debouncedAddAmount, resetTransactionStates]
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

      dispatchSuccess(`${market?.loanAsset.symbol || 'Token'} approved successfully`);
      console.log('Approval confirmed!');
    } else if (approveTx.txState === 'error') {
      dispatchError(`Failed to approve ${market?.loanAsset.symbol || 'token'}`);
      setTxError(`Approval failed. Please try again.`);
      console.log(approveTx.txError);

      console.error('Approval transaction failed');
    } else if (approveTx.txState === 'submitted') {
      console.log('Approval transaction submitted');
    }
  }, [approveTx.txState, market?.loanAsset.symbol, refetchAllowance]);

  useEffect(() => {
    if (supplyTx.txState === 'confirmed') {
      // Clear input and update states
      setAddAmount('');
      setInputAmount('');
      // Reset active percentage button
      setActivePercentage(null);

      // Show success message
      dispatchSuccess(`${market?.loanAsset.symbol || 'Loan'} supplied successfully`);
      console.log('Supply confirmed!');

      // After successful transaction, we might want to refresh any balances
      if (refetchAllowance) {
        refetchAllowance();
      }

      if (onSuccess) {
        onSuccess();
      }
    } else if (supplyTx.txState === 'error') {
      dispatchError(`Failed to supply ${market?.loanAsset.symbol || 'loan'}`);
      setTxError(`Supply failed. Please try again.`);
      console.error('Supply transaction failed');
    } else if (supplyTx.txState === 'submitted') {
      console.log('Supply transaction submitted');
    }
  }, [supplyTx.txState, market?.loanAsset.symbol, refetchAllowance, onSuccess]);

  const handleSupply = useCallback(async () => {
    if (!userAddress || !uniqueKey || !debouncedAddAmount || parseFloat(normalizePointAmount(debouncedAddAmount)) <= 0) {
      return;
    }

    setTxError(null);

    if (!market) {
      setTxError('Market data not available');
      return;
    }

    // Reset error states if trying again
    console.log('Resetting transaction states...');
    if (approveTx.txState === 'error' || supplyTx.txState === 'error') {
      if (approveTx.txState === 'error') {
        approveTx.resetTx();
      }
      if (supplyTx.txState === 'error') {
        supplyTx.resetTx();
      }
    }

    const assetAddress = market.loanAsset.address;
    const marketAddress = chainConfig.contracts.Morpho;
    const assetDecimals = market.loanAsset.decimals;

    // Round down the amount to ensure we don't try to use more tokens than available
    // const amountFloat = parseFloat(normalizePointAmount(debouncedAddAmount));
    // const multiplier = Math.pow(10, assetDecimals);
    // const roundedAmount = BigInt(Math.floor(amountFloat * multiplier));
    const amountBN = parseUnits(normalizePointAmount(debouncedAddAmount), assetDecimals);
    // Calculate amount with decimals
    // const amountBN = Math.floor(roundedAmount * 10 ** assetDecimals));

    console.log('Attempting transaction with amount:', amountBN.toString());
    // console.log(debouncedAddAmount);
    // console.log(amountFloat);
    // console.log(multiplier);
    // console.log(roundedAmount);
    // console.log(Math.floor(roundedAmount * 10 ** assetDecimals).toFixed(18));
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
      // Step 2: Supply loan asset if already approved
      else if (isApproved && market && uniqueKey && userAddress && debouncedAddAmount && !supplyTx.isCompleted) {
        console.log('Initiating supply transaction...');
        await supplyTx.sendTransaction({
          address: chainConfig.contracts.Morpho,
          abi: morphoContractConfig.abi,
          functionName: 'supply',
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
      // uint256 assets,
      //   uint256 shares,
      //   address onBehalf,
      //   bytes calldata data
    } catch (error) {
      console.error('Transaction failed:', error);
      if (!isApproved) {
        dispatchError(`Failed to approve ${market.loanAsset.symbol}`);
      } else {
        dispatchError(`Failed to supply ${market.loanAsset.symbol}`);
      }
      resetTransactionStates();
      setTxError(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [userAddress, uniqueKey, debouncedAddAmount, market, isApproved, chainConfig, approveTx, supplyTx, resetTransactionStates]);

  // Check if any transaction is in progress
  const isTransactionInProgress =
    approveTx.txState === 'submitting' ||
    approveTx.txState === 'submitted' ||
    supplyTx.txState === 'submitting' ||
    supplyTx.txState === 'submitted';

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
      return `Approve ${market?.loanAsset.symbol || ''}`;
    }

    if (supplyTx.txState === 'submitting' || supplyTx.txState === 'submitted') {
      return 'Supplying...';
    }
    if (supplyTx.txState === 'error') {
      return 'Supply Failed - Try again';
    }

    return 'Supply';
  }, [addAmount, isApproved, allowanceChecking, approveTx.txState, supplyTx.txState, market?.loanAsset.symbol]);

  // Determine if button should be disabled
  const isButtonDisabled = useCallback(() => {
    if (!addAmount || parseFloat(addAmount) <= 0) return true;
    if (parseFloat(addAmount) > parseFloat(formattedLoanBalance)) return true;

    // Disable during allowance checking (debounce period)
    if (allowanceChecking) return true;

    // Disable during transactions
    if (isTransactionInProgress) return true;

    return false;
  }, [addAmount, formattedLoanBalance, allowanceChecking, isTransactionInProgress]);

  // Determine if input and percentage buttons should be disabled
  const isInputDisabled = isTransactionInProgress;

  if (!market) {
    return <Box>Incorrect Market Data</Box>;
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
              Supply Loan
            </Typography>
            <Typography variant="body2">Supply Loan Amount:</Typography>
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
            {market.loanAsset?.symbol && (
              <TokenIcon
                sx={{ width: '45px', height: '45px', display: 'flex', alignItems: 'center', zIndex: 1, marginBottom: '15px' }}
                avatarProps={{ sx: { width: 45, height: 45 } }}
                symbol={market.loanAsset?.symbol}
              />
            )}
            <Typography fontWeight="bold">{market.loanAsset?.symbol || 'N/A'}</Typography>
          </Box>
        </Box>
        <CustomInput
          autoFocus
          type="text"
          fullWidth
          value={inputAmount}
          onChange={(e) => {
            let val = formatAssetOutput(e.target.value);
            setAddAmount(val);
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
            onClick={() => handlePercentClick(25)}
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
            onClick={() => handlePercentClick(50)}
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
            onClick={() => handlePercentClick(75)}
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
            onClick={() => handlePercentClick(100)}
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
            {formatAssetOutput(Number(formattedLoanBalance).toFixed(6))} {market.loanAsset?.symbol || 'N/A'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSupply}
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

export default SupplyTab;
