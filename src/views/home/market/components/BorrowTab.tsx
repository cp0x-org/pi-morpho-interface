import Box from '@mui/material/Box';
import { InputAdornment, TextField, Typography } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useWriteTransaction } from 'hooks/useWriteTransaction';
import { useDebounce } from 'hooks/useDebounce';
import { useTheme } from '@mui/material/styles';
import { TokenIcon } from 'components/TokenIcon';
import { CustomInput } from 'components/CustomInput';
import { INPUT_DECIMALS } from '@/appconfig';
import Divider from '@mui/material/Divider';

interface BorrowTabProps {
  market: MarketInterface;
  accrualPosition: AccrualPosition | null;
  onSuccess?: () => void;

  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

export default function BorrowTab({ market, accrualPosition, onBorrowAmountChange, onSuccess }: BorrowTabProps) {
  const theme = useTheme();
  const [borrowAmount, setBorrowAmount] = useState<string>('');
  const [inputAmount, setInputAmount] = useState('');
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  useEffect(() => {
    if (!market) {
      console.log('Market data not available');
      return;
    }

    let amount = borrowAmount ? borrowAmount : '0';

    const amountFloat = parseFloat(amount);
    const assetDecimals = market.loanAsset.decimals;

    const multiplier = Math.pow(10, assetDecimals);
    const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

    onBorrowAmountChange(amountBN);
  }, [borrowAmount, market]);

  // Use the transaction hook
  const borrowTx = useWriteTransaction();

  const formattedMaxBorrowable = useMemo(() => {
    if (!accrualPosition?.maxBorrowableAssets) return '0';

    return formatUnits(accrualPosition?.maxBorrowableAssets as bigint, market?.loanAsset?.decimals ? market.loanAsset.decimals : 0);
  }, [accrualPosition, market]);

  const formattedSafeMaxBorrowable = useMemo(() => {
    if (!accrualPosition?.maxBorrowableAssets) return '0';

    let borrowable = formatUnits(
      accrualPosition?.maxBorrowableAssets as bigint,
      market?.loanAsset?.decimals ? market.loanAsset.decimals : 0
    );

    let safeBorrowable = Number(borrowable) * 0.94; // 6% safety margin

    return safeBorrowable.toFixed(market?.loanAsset?.decimals ? market.loanAsset.decimals / 3 : 6);
  }, [accrualPosition, market]);

  const handlePercentClick = useCallback(
    (percent: number) => {
      const value = (parseFloat(formattedSafeMaxBorrowable) * percent) / 100;
      setBorrowAmount(value.toString());
      setInputAmount(value.toFixed(INPUT_DECIMALS).toString());

      // Set active percentage
      setActivePercentage(percent);
    },
    [formattedSafeMaxBorrowable]
  );

  // Handle transaction state changes
  useEffect(() => {
    if (borrowTx.txState === 'confirmed') {
      setBorrowAmount('');
      setInputAmount('');
      dispatchSuccess(`${market.loanAsset?.symbol || 'Tokens'} borrowed successfully`);
      if (onSuccess) {
        onSuccess();
      }
      borrowTx.resetTx();
    } else if (borrowTx.txState === 'error') {
      setTxError(`Transaction failed`);
      dispatchError(`Cannot borrow ${market.loanAsset?.symbol || 'tokens'}: 'Transaction failed'}`);
    }
  }, [borrowTx.txState, borrowTx.txError, borrowTx.resetTx, market.loanAsset?.symbol, onSuccess, borrowTx]);

  // Handle borrow loan asset
  const handleBorrow = useCallback(async () => {
    if (!userAddress || !market.uniqueKey || !borrowAmount || parseFloat(borrowAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      return;
    }

    try {
      const amountFloat = parseFloat(borrowAmount);
      const assetDecimals = market.loanAsset.decimals;

      const multiplier = Math.pow(10, assetDecimals);
      const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
      const amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));

      await borrowTx.sendTransaction({
        address: chainConfig.contracts.Morpho as `0x${string}`,
        abi: morphoContractConfig.abi,
        functionName: 'borrow',
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
      console.error('Error borrowing tokens:', error);
      setTxError(`Failed to borrow: ${error instanceof Error ? error.message : ''}`);
    }
  }, [userAddress, market, borrowAmount, borrowTx, chainConfig.contracts.Morpho]);

  // Check if transaction is in progress
  const isTransactionInProgress = borrowTx.txState === 'submitting' || borrowTx.txState === 'submitted';

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
              Borrow
            </Typography>
            <Typography variant="body2">Borrow Amount:</Typography>
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
          type="number"
          fullWidth
          value={inputAmount}
          onChange={(e) => {
            setBorrowAmount(e.target.value);
            setInputAmount(e.target.value);
            // Clear active percentage when user manually enters a value
            if (activePercentage !== null) {
              setActivePercentage(null);
            }
          }}
          disabled={isTransactionInProgress}
          placeholder="0"
          inputProps={{ inputMode: 'numeric' }}
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
            disabled={isTransactionInProgress}
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
            disabled={isTransactionInProgress}
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
            disabled={isTransactionInProgress}
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
            disabled={isTransactionInProgress}
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
            flexDirection: 'column',
            width: '100%',
            backgroundColor: theme.palette.background.paper,
            margin: '10px 0'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              backgroundColor: theme.palette.background.paper,
              margin: '10px 0 20px 0'
            }}
          >
            <Typography variant="h4" fontWeight="normal">
              Max Borrowable:
            </Typography>
            <Typography variant="h4" fontWeight="normal">
              {Number(formattedMaxBorrowable).toFixed(6)} {market.loanAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <Divider sx={{ width: '100%', mx: 'auto', borderBottomWidth: 3 }} />

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              backgroundColor: theme.palette.background.paper,
              margin: '20px 0 0 0'
            }}
          >
            <Typography variant="h4" fontWeight="normal">
              Safe Borrowable:
            </Typography>
            <Typography variant="h4" fontWeight="normal">
              {Number(formattedSafeMaxBorrowable).toFixed(6)} {market.loanAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleBorrow}
          disabled={
            !borrowAmount ||
            parseFloat(borrowAmount) <= 0 ||
            parseFloat(borrowAmount) > parseFloat(formattedSafeMaxBorrowable) ||
            isTransactionInProgress
          }
          sx={{
            height: '58px',
            width: '100%',
            marginTop: '20px',
            fontFamily: 'Roboto, Arial, sans-serif',
            fontSize: '18px',
            fontWeight: 700
          }}
        >
          {borrowTx.txState === 'submitting' ? 'Preparing...' : borrowTx.txState === 'submitted' ? 'Borrowing...' : 'Borrow'}
        </Button>
      </Box>
    </Box>
  );
}
