import Box from '@mui/material/Box';
import { Typography } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { AccrualPosition, Market } from '@morpho-org/blue-sdk';
import { useWriteTransaction } from 'hooks/useWriteTransaction';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { TokenIcon } from 'components/TokenIcon';
import { CustomInput } from 'components/CustomInput';
import { useTheme } from '@mui/material/styles';
import { INPUT_DECIMALS } from '@/appconfig';
import { formatAssetOutput, normalizePointAmount } from 'utils/formatters';

interface WithdrawTabProps {
  market: MarketInterface;
  sdkMarket: Market | null;
  accrualPosition: AccrualPosition | null;
  uniqueKey: string;
  onSuccess?: () => void;

  onBorrowAmountChange: (amount: bigint) => void;
  onLoanAmountChange: (amount: bigint) => void;
}

export default function WithdrawTab({ market, sdkMarket, accrualPosition, uniqueKey, onLoanAmountChange, onSuccess }: WithdrawTabProps) {
  // Internal state management
  const theme = useTheme();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();
  const [txError, setTxError] = useState<string | null>(null);
  // Use the custom transaction hook
  const { sendTransaction, txState, txError: txRawError, isCompleted, resetTx } = useWriteTransaction();
  const formattedWithdrawable = useMemo(() => {
    if (!accrualPosition?.supplyShares) return '0';
    return formatUnits(
      sdkMarket?.toSupplyAssets(accrualPosition?.supplyShares) as bigint,
      market?.loanAsset?.decimals ? market.loanAsset.decimals : 0
    );
  }, [accrualPosition, market]);

  useEffect(() => {
    if (!market) {
      console.log('Market data not available');
      return;
    }

    let amount = withdrawAmount ? normalizePointAmount(withdrawAmount) : '0';

    const assetDecimals = market.loanAsset.decimals;
    const amountBN = parseUnits(amount, assetDecimals);
    // const amountFloat = parseFloat(amount);
    // const multiplier = Math.pow(10, assetDecimals);
    // const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    // const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));
    onLoanAmountChange(-amountBN);
  }, [withdrawAmount, market]);

  // Handle successful transaction completion
  useEffect(() => {
    if (isCompleted && txState === 'confirmed') {
      dispatchSuccess(`Successfully withdrew ${withdrawAmount} ${market.loanAsset.symbol}`);
      setWithdrawAmount('');

      // Call onSuccess to refresh the position data
      if (onSuccess) {
        onSuccess();
      }

      resetTx();
    }
  }, [isCompleted, txState, withdrawAmount, market.loanAsset.symbol, onSuccess, resetTx]);

  // Handle transaction errors
  useEffect(() => {
    if (txState === 'error' && txRawError) {
      dispatchError(`Failed to withdraw`);
      setTxError('Failed to withdraw');
    }
  }, [txState, txRawError]);

  // Handle withdraw loan
  const handleWithdraw = async () => {
    if (!userAddress || !uniqueKey || !withdrawAmount || parseFloat(normalizePointAmount(withdrawAmount)) <= 0) {
      return;
    }

    if (!market) {
      dispatchError('Market Not Found');
      return;
    }
    const assetDecimals = market.loanAsset.decimals;
    const amountBN = parseUnits(normalizePointAmount(withdrawAmount), assetDecimals);
    // const amountFloat = parseFloat(normalizePointAmount(withdrawAmount));
    // const multiplier = Math.pow(10, assetDecimals);
    // const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    // const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    try {
      // Execute transaction using the custom hook
      await sendTransaction({
        address: chainConfig.contracts.Morpho as `0x${string}`,
        abi: morphoContractConfig.abi,
        functionName: 'withdraw',
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
      console.error('Error withdrawing loan token:', error);
      dispatchError(`Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`);
      setTxError(`Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Handle percentage button clicks
  const handlePercentClick = useCallback(
    (percent: number) => {
      const decimals = market?.loanAsset?.decimals || 0;
      const rawValue = (parseFloat(formattedWithdrawable) * percent) / 100;
      const factor = 10 ** decimals;
      const value = Math.floor(rawValue * factor) / factor;

      // const value = ((parseFloat(formattedLoanBalance) * percent) / 100).toFixed(market?.loanAsset?.decimals);
      setWithdrawAmount(value.toString());
      setInputAmount(formatAssetOutput(value.toFixed(INPUT_DECIMALS).toString()));

      // Set active percentage
      setActivePercentage(percent);
    },
    [formattedWithdrawable, market?.loanAsset?.decimals]
  );

  // Determine if the button should be disabled
  const isButtonDisabled =
    !withdrawAmount ||
    parseFloat(normalizePointAmount(withdrawAmount)) <= 0 ||
    parseFloat(normalizePointAmount(withdrawAmount)) > parseFloat(formattedWithdrawable) ||
    txState === 'submitting' ||
    txState === 'submitted';

  // Determine button text based on transaction state
  const getButtonText = () => {
    switch (txState) {
      case 'submitting':
        return 'Preparing Transaction...';
      case 'submitted':
        return 'Withdrawing...';
      default:
        return 'Withdraw';
    }
  };

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
              Withdraw Loan
            </Typography>
            <Typography variant="body2">Withdraw Loan Token Amount:</Typography>
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
            setWithdrawAmount(val);
            setInputAmount(val);
            // Clear active percentage when user manually enters a value
            if (activePercentage !== null) {
              setActivePercentage(null);
            }
          }}
          disabled={txState === 'submitting' || txState === 'submitted'}
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
            disabled={txState === 'submitting' || txState === 'submitted'}
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
            disabled={txState === 'submitting' || txState === 'submitted'}
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
            disabled={txState === 'submitting' || txState === 'submitted'}
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
            disabled={txState === 'submitting' || txState === 'submitted'}
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
            {Number(formattedWithdrawable).toFixed(6)} {market.loanAsset?.symbol || 'N/A'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleWithdraw}
          disabled={isButtonDisabled}
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
}
