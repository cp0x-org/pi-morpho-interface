import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Button, TextField, InputAdornment, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import React, { useState, useMemo, useEffect, FC, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useWriteTransaction } from 'hooks/useWriteTransaction';

import { Vault } from 'types/vaults';
import { TokenIcon } from 'components/TokenIcon';
import { INPUT_DECIMALS } from '@/appconfig';
import { CustomInput } from 'components/CustomInput';

interface WithdrawProps {
  vaultAddress: string;
  vaultData: Vault;
}

const WithdrawTab: FC<WithdrawProps> = ({ vaultAddress = '', vaultData }) => {
  const theme = useTheme();
  const [inputAmount, setInputAmount] = useState('');
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const navigate = useNavigate();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const { address: userAddress } = useAccount();

  // Use transaction hooks
  const {
    sendTransaction: writeWithdraw,
    txState: withdrawTxState,
    txHash: withdrawTxHash,
    isCompleted: isWithdrawCompleted,
    resetTx: resetWithdrawTx
  } = useWriteTransaction();

  // Handle withdraw transaction
  const handleWithdraw = useCallback(async () => {
    if (!userAddress || !vaultAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!vaultData) {
      setTxError('Vault data not available');
      return;
    }

    // Reset error states if trying again
    if (withdrawTxState === 'error') {
      resetWithdrawTx();
    }

    const assetDecimals = vaultData.asset.decimals;

    // Round down the amount to ensure we don't try to withdraw more than available
    const amountFloat = parseFloat(withdrawAmount);
    const multiplier = Math.pow(10, assetDecimals);
    const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;

    // Calculate amount with decimals
    const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    console.log('Attempting withdrawal with amount:', roundedAmount, 'Wei:', amountBN.toString());

    try {
      // This only sends the transaction to the network, doesn't mean it's confirmed
      // No success notification here - we'll notify only after blockchain confirmation
      writeWithdraw({
        abi: vaultConfig.abi,
        address: vaultAddress as `0x${string}`,
        functionName: 'withdraw',
        args: [amountBN, userAddress as `0x${string}`, userAddress as `0x${string}`]
      });

      // Log that we've started the transaction process, but don't notify user yet
      console.log('Withdrawal transaction initiated');
    } catch (error) {
      console.error('Error initiating withdrawal:', error);
      setTxError(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      dispatchError(`Failed to initiate withdrawal of ${vaultData.asset.symbol}`);
    }
  }, [userAddress, vaultAddress, withdrawAmount, vaultData, withdrawTxState, resetWithdrawTx, writeWithdraw]);

  // Read user's vault balance
  const { data: vaultBalance, refetch: refetchVaultBalance } = useReadContract({
    abi: vaultConfig.abi,
    address: vaultAddress as `0x${string}` | undefined,
    functionName: 'maxWithdraw',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!vaultAddress
    }
  });

  // Handle success/error notifications only after blockchain confirmation
  useEffect(() => {
    // For submitted transactions, just log but don't notify user yet
    if (withdrawTxState === 'submitted') {
      console.log('Withdrawal transaction submitted:', withdrawTxHash);
    }
    // Only show success notification after the transaction is confirmed on blockchain
    else if (withdrawTxState === 'confirmed') {
      // Update UI and show success message
      setWithdrawAmount('');

      // Show success notification only after blockchain confirmation
      dispatchSuccess(`${vaultData?.asset.symbol || 'Tokens'} withdrawn successfully`);
      console.log('Withdrawal confirmed on blockchain!');

      // After successful withdrawal, refresh vault balance
      if (refetchVaultBalance) {
        refetchVaultBalance();
      }

      // Reset the transaction state to enable the percentage buttons
      resetWithdrawTx();
    }
    // Handle error state
    else if (withdrawTxState === 'error') {
      dispatchError(`Failed to withdraw ${vaultData?.asset.symbol || 'tokens'}`);
      setTxError(`Withdrawal failed. Please try again.`);
      console.error('Withdrawal transaction failed');
    }
  }, [withdrawTxState, withdrawTxHash, refetchVaultBalance, vaultData?.asset.symbol, resetWithdrawTx]);

  // Reset form after confirmed withdrawal
  useEffect(() => {
    if (isWithdrawCompleted) {
      setWithdrawAmount('');
      // Reset transaction state after the transaction is completed
      resetWithdrawTx();
    }
  }, [isWithdrawCompleted, resetWithdrawTx]);

  // Format vault balance for display
  const formattedVaultBalance = useMemo(() => {
    if (!vaultBalance || !vaultData) return '0';
    return formatUnits(vaultBalance as bigint, vaultData.asset.decimals);
  }, [vaultBalance, vaultData]);

  // Get button text based on transaction states
  const getButtonText = useCallback(() => {
    if (!withdrawAmount) {
      return 'Enter Amount';
    }

    if (withdrawTxState === 'submitting' || withdrawTxState === 'submitted') {
      return 'Withdrawing...';
    }
    if (withdrawTxState === 'error') {
      return 'Withdrawal Failed - Try again';
    }
    if (withdrawTxState === 'confirmed') {
      return 'Success!';
    }

    return 'Withdraw';
  }, [withdrawAmount, withdrawTxState]);

  // Determine if button should be disabled
  const isButtonDisabled = useCallback(() => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return true;

    // Disable during transactions
    if (withdrawTxState === 'submitting' || withdrawTxState === 'submitted') return true;

    // Disable when withdraw is already completed
    return withdrawTxState === 'confirmed';
  }, [withdrawAmount, withdrawTxState]);

  // Determine if input and percentage buttons should be disabled
  const isInputDisabled = withdrawTxState === 'submitting' || withdrawTxState === 'submitted';

  // Handle percentage button clicks with better formatting
  const handleWithdrawPercentClick = useCallback(
    (percent: number) => {
      const maxAmount = parseFloat(formattedVaultBalance);
      const value = (maxAmount * percent) / 100;

      // Ensure we don't exceed available balance by rounding down
      const roundedValue = Math.floor(value * 10000) / 10000; // 4 decimal places

      setWithdrawAmount(roundedValue.toString());
      setInputAmount(value.toFixed(INPUT_DECIMALS).toString());

      // Set active percentage
      setActivePercentage(percent);
      // Reset transaction states if changing amount
      if (withdrawTxState === 'error' || withdrawTxState === 'confirmed') {
        resetWithdrawTx();
      }
    },
    [formattedVaultBalance, withdrawTxState, resetWithdrawTx]
  );

  if (!vaultData) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" color="error">
          Vault not found
        </Typography>
        <CircularProgress />
      </Box>
    );
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
              Withdraw Asset
            </Typography>
            <Typography variant="body2">Withdraw Amount:</Typography>
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
          type="number"
          fullWidth
          value={inputAmount}
          onChange={(e) => {
            setWithdrawAmount(e.target.value);
            setInputAmount(e.target.value);
            // Clear active percentage when user manually enters a value
            if (activePercentage !== null) {
              setActivePercentage(null);
            }
            if (withdrawTxState === 'error' || withdrawTxState === 'confirmed') {
              resetWithdrawTx();
            }
          }}
          disabled={isInputDisabled}
          placeholder="0"
          inputProps={{ inputMode: 'numeric' }}
        />

        {/*<TextField*/}
        {/*  label="Withdraw Amount"*/}
        {/*  variant="outlined"*/}
        {/*  type="number"*/}
        {/*  fullWidth*/}
        {/*  value={withdrawAmount}*/}
        {/*  onChange={(e) => {*/}
        {/*    setWithdrawAmount(e.target.value);*/}
        {/*    if (withdrawTxState === 'error' || withdrawTxState === 'confirmed') {*/}
        {/*      resetWithdrawTx();*/}
        {/*    }*/}
        {/*  }}*/}
        {/*  disabled={isInputDisabled}*/}
        {/*  InputProps={{*/}
        {/*    endAdornment: <InputAdornment position="end">{vaultData.asset.symbol}</InputAdornment>*/}
        {/*  }}*/}
        {/*/>*/}

        {/*  <Typography variant="body2" color="text.secondary">*/}
        {/*    Vault Balance: {Number(formattedVaultBalance).toFixed(6)} {vaultData.asset.symbol}*/}
        {/*  </Typography>*/}

        {/*  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>*/}
        {/*    <Button variant="outlined" size="small" onClick={() => handleWithdrawPercentClick(25)} disabled={isInputDisabled}>*/}
        {/*      25%*/}
        {/*    </Button>*/}
        {/*    <Button variant="outlined" size="small" onClick={() => handleWithdrawPercentClick(50)} disabled={isInputDisabled}>*/}
        {/*      50%*/}
        {/*    </Button>*/}
        {/*    <Button variant="outlined" size="small" onClick={() => handleWithdrawPercentClick(75)} disabled={isInputDisabled}>*/}
        {/*      75%*/}
        {/*    </Button>*/}
        {/*    <Button variant="outlined" size="small" onClick={() => handleWithdrawPercentClick(100)} disabled={isInputDisabled}>*/}
        {/*      Max*/}
        {/*    </Button>*/}
        {/*  </Box>*/}
        {/*  {txError && (*/}
        {/*    <Typography color="error" variant="body2" sx={{ mb: 2 }}>*/}
        {/*      {txError}*/}
        {/*    </Typography>*/}
        {/*  )}*/}
        {/*  <Button variant="contained" color="primary" onClick={handleWithdraw} disabled={isButtonDisabled()}>*/}
        {/*    {getButtonText()}*/}
        {/*  </Button>*/}
        {/*</Box>*/}
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
            onClick={() => handleWithdrawPercentClick(25)}
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
            onClick={() => handleWithdrawPercentClick(50)}
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
            onClick={() => handleWithdrawPercentClick(75)}
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
            onClick={() => handleWithdrawPercentClick(100)}
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
            Withdrawable:
          </Typography>
          <Typography variant="h4" fontWeight="normal">
            {Number(formattedVaultBalance).toFixed(6)} {vaultData.asset.symbol}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleWithdraw}
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

export default WithdrawTab;
