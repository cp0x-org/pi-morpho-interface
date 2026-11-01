import Box from '@mui/material/Box';
import { Typography, useTheme } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useState, useMemo, useEffect, useCallback, FC } from 'react';
import { MarketInterface } from 'types/market';
import { useAccount, useBlock, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatUnits, parseUnits } from 'viem';
import { AccrualPosition, Market, MarketParams, MathLib } from '@morpho-org/blue-sdk';
import { Time } from '@morpho-org/morpho-ts';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useDebounce } from 'hooks/useDebounce';
import { useWriteTransaction } from 'hooks/useWriteTransaction';
import { TokenIcon } from 'components/TokenIcon';
import { CustomInput } from 'components/CustomInput';
import Divider from '@mui/material/Divider';
import { INPUT_DECIMALS, getMorphoAddress } from '@/appconfig';
import { formatAssetOutput, normalizePointAmount, parseAmountOrZero, percentOfAmount, truncateDecimals } from 'utils/formatters';
import { MaxRepayInputs, MaxRepayPlan, maxRepayPlanStands, planMaxRepay } from 'utils/repay';
import { visuallyHidden } from 'utils/a11y';
import { FormattedMessage, useIntl } from 'react-intl';

/**
 * The debt floor is taken this long before the latest block: the market state can be read a block or so behind it, and
 * a big repay by someone else in between slows the interest down.
 */
const DEBT_FLOOR_LAG_SECONDS = 60n;

interface RepayTabProps {
  market: MarketInterface;
  chainId: number;
  marketParams: MarketParams | null;
  accrualPosition: AccrualPosition | null;
  /** The position on the market state as last written on chain, before accruing it to now. */
  onchainPosition: AccrualPosition | null;
  sdkMarket: Market | null;
  marketId: string;
  onSuccess?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

const RepayTab: FC<RepayTabProps> = ({
  market,
  chainId,
  marketParams,
  accrualPosition,
  onchainPosition,
  sdkMarket,
  marketId,
  onBorrowAmountChange,
  onSuccess
}) => {
  // State for input and transactions
  const theme = useTheme();
  const intl = useIntl();
  const [repayAmount, setRepayAmount] = useState('');
  const debouncedRepayAmount = useDebounce(repayAmount, 500);
  const [txError, setTxError] = useState<string | null>(null);
  const [allowanceChecking, setAllowanceChecking] = useState(false);

  const [isApproved, setIsApproved] = useState(false);
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  const [inputAmount, setInputAmount] = useState('');
  // The plan Max put in the field; it is what Approve and Repay send.
  const [maxPlan, setMaxPlan] = useState<MaxRepayPlan | null>(null);

  // Hooks
  const { address: userAddress } = useAccount();
  const morphoAddress = getMorphoAddress(chainId);

  // Transaction hooks
  const approveTx = useWriteTransaction();
  const repayTx = useWriteTransaction();

  // Read user's loan token balance
  const { data: userBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    chainId,
    address: market?.loanAsset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!market?.loanAsset
    }
  });

  const loanBalanceBN = useMemo(() => {
    if (!accrualPosition?.borrowShares || !sdkMarket) return 0n;
    return sdkMarket.toBorrowAssets(accrualPosition.borrowShares);
  }, [accrualPosition?.borrowShares, sdkMarket]);

  const hasLoan = !!onchainPosition && onchainPosition.borrowShares > 0n;
  const { data: latestBlock } = useBlock({ chainId, watch: true, query: { enabled: hasLoan } });

  // What a Max plan is built from. Both bounds of the debt come from the market state as last written on chain, accrued
  // once from its last update, as Morpho does when the repay lands: the debt to now, the floor to before the latest block.
  const readMaxRepayInputs = useCallback((): MaxRepayInputs | null => {
    if (!onchainPosition) return null;
    const { market: onchainMarket, borrowShares } = onchainPosition;
    const accruedTo = (timestamp: bigint) => onchainMarket.accrueInterest(MathLib.max(timestamp, onchainMarket.lastUpdate));
    let debtAssets = onchainMarket.toBorrowAssets(borrowShares, 'Up');
    let debtFloor = onchainMarket.toBorrowAssets(borrowShares, 'Down');
    try {
      const blockTime = latestBlock?.timestamp;
      const now = Time.timestamp();
      debtAssets = accruedTo(blockTime !== undefined && blockTime > now ? blockTime : now).toBorrowAssets(borrowShares, 'Up');
      if (blockTime !== undefined) debtFloor = accruedTo(blockTime - DEBT_FLOOR_LAG_SECONDS).toBorrowAssets(borrowShares, 'Down');
    } catch (accrualError) {
      console.warn('Market accrual failed, planning Max on the debt as last written on chain', accrualError);
    }
    return { debtAssets, debtFloor, borrowShares, walletBalance: (userBalance as bigint | undefined) ?? 0n };
  }, [onchainPosition, latestBlock?.timestamp, userBalance]);

  // Format balances for display
  const formattedLoanBalance = useMemo(() => {
    if (!market?.loanAsset?.decimals) return '0';
    return formatUnits(loanBalanceBN, market.loanAsset.decimals);
  }, [loanBalanceBN, market?.loanAsset?.decimals]);

  const formattedUserBalance = useMemo(() => {
    if (!userBalance) return '0';
    return formatUnits(userBalance as bigint, market?.loanAsset?.decimals ? market?.loanAsset?.decimals : 0);
  }, [userBalance, market]);

  // Check allowance to determine if approval is needed
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABIConfig.abi,
    chainId,
    address: market?.loanAsset.address as `0x${string}` | undefined,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, morphoAddress as `0x${string}`],
    query: {
      enabled: !!userAddress && !!market?.loanAsset && !!morphoAddress
    }
  });

  useEffect(() => {
    if (!market) {
      console.log('Market data not available');
      return;
    }

    onBorrowAmountChange(-parseAmountOrZero(repayAmount, market.loanAsset.decimals));
  }, [repayAmount, market]);

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
        const amountBigInt =
          activePercentage === 100 && maxPlan
            ? maxPlan.requiredAllowance
            : parseUnits(normalizePointAmount(debouncedRepayAmount), market.loanAsset.decimals);

        const shouldBeApproved = allowanceData >= amountBigInt;

        // Only update state if it's different to avoid unnecessary re-renders
        if (shouldBeApproved !== isApproved) {
          setIsApproved(shouldBeApproved);
        }
      } catch (error) {
        console.error('Error checking allowance:', error);
      }
    }
  }, [userAddress, debouncedRepayAmount, allowanceData, isApproved, market, activePercentage, maxPlan]);

  // Reset transaction states
  const resetTransactionStates = useCallback(() => {
    approveTx.resetTx();
    repayTx.resetTx();
  }, [approveTx, repayTx]);

  // Max shows what the transactions send: the whole debt when the plan closes the loan by shares, the assets otherwise.
  const showMaxPlan = useCallback(
    (plan: MaxRepayPlan) => {
      const value = formatUnits(plan.shares > 0n ? loanBalanceBN : plan.assets, market?.loanAsset?.decimals ?? 0);
      setMaxPlan(plan);
      setRepayAmount(value);
      setInputAmount(formatAssetOutput(truncateDecimals(value, INPUT_DECIMALS)));
    },
    [loanBalanceBN, market?.loanAsset?.decimals]
  );

  // Handle percentage button clicks
  const handlePercentClick = useCallback(
    (percent: number) => {
      const walletBalance = (userBalance as bigint | undefined) ?? 0n;
      const base = walletBalance < loanBalanceBN ? walletBalance : loanBalanceBN;
      const value = percentOfAmount(base, percent, market?.loanAsset?.decimals ?? 0);

      const maxInputs = percent === 100 ? readMaxRepayInputs() : null;
      if (maxInputs) {
        showMaxPlan(planMaxRepay(maxInputs));
      } else {
        // The exact amount goes into the transaction; the field shows it cut to INPUT_DECIMALS.
        setMaxPlan(null);
        setRepayAmount(value);
        setInputAmount(formatAssetOutput(truncateDecimals(value, INPUT_DECIMALS)));
      }
      setActivePercentage(percent);

      if (repayAmount !== debouncedRepayAmount) {
        setAllowanceChecking(true);
      }
      resetTransactionStates();
      setIsApproved(false);
    },
    [
      loanBalanceBN,
      userBalance,
      market?.loanAsset?.decimals,
      repayAmount,
      debouncedRepayAmount,
      resetTransactionStates,
      readMaxRepayInputs,
      showMaxPlan
    ]
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

      dispatchSuccess(
        intl.formatMessage({ id: 'tx.approveSuccess' }, { symbol: market?.loanAsset.symbol || intl.formatMessage({ id: 'common.token' }) })
      );
      console.log('Approval confirmed!');
    } else if (approveTx.txState === 'error') {
      dispatchError(
        intl.formatMessage(
          { id: 'tx.approveError' },
          { symbol: market?.loanAsset.symbol || intl.formatMessage({ id: 'common.tokenLower' }) }
        )
      );
      setTxError(intl.formatMessage({ id: 'tx.approveRetry' }));
      console.error('Approval transaction failed');
      console.error(approveTx.txError);
    } else if (approveTx.txState === 'submitted') {
      console.log('Approval transaction submitted');
    }
  }, [approveTx.txState, market?.loanAsset.symbol, refetchAllowance, intl]);

  // Handle repay transaction success/error
  useEffect(() => {
    if (repayTx.txState === 'confirmed') {
      // Clear input and update states
      setRepayAmount('');
      setInputAmount('');
      setMaxPlan(null);

      // Set active percentage
      setActivePercentage(null);

      // Show success message
      dispatchSuccess(
        intl.formatMessage({ id: 'repay.success' }, { symbol: market?.loanAsset.symbol || intl.formatMessage({ id: 'table.loan' }) })
      );

      // After successful transaction, we might want to refresh any balances
      if (refetchAllowance) {
        refetchAllowance();
      }

      if (onSuccess) {
        onSuccess();
      }
    } else if (repayTx.txState === 'error') {
      dispatchError(
        intl.formatMessage({ id: 'repay.error' }, { symbol: market?.loanAsset.symbol || intl.formatMessage({ id: 'table.loan' }) })
      );
      setTxError(intl.formatMessage({ id: 'repay.errorRetry' }));
      console.error('Repay loan transaction failed');
    } else if (repayTx.txState === 'submitted') {
      console.log('Repay loan transaction submitted');
    }
  }, [repayTx.txState, market?.loanAsset.symbol, refetchAllowance, onSuccess, intl]);

  // Handle repay loan
  const handleRepay = useCallback(async () => {
    if (!userAddress || !marketId || !repayAmount || parseFloat(repayAmount) <= 0) {
      return;
    }

    setTxError(null);
    if (!market || !marketParams || !morphoAddress) {
      setTxError(intl.formatMessage({ id: 'tx.marketDataUnavailable' }));
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
    const marketAddress = morphoAddress;
    const assetDecimals = market.loanAsset.decimals;

    // Round down the amount to ensure we don't try to use more tokens than available
    // const amountFloat = parseFloat(normalizePointAmount(debouncedRepayAmount));
    // const multiplier = Math.pow(10, assetDecimals);
    // const roundedAmount = Math.floor(amountFloat * multiplier) / multiplier;
    //
    // // Calculate amount with decimals
    let sharesAmountBN = 0n;
    let amountBN = parseUnits(normalizePointAmount(debouncedRepayAmount), assetDecimals);
    // let amountBN = BigInt(Math.floor(roundedAmount * 10 ** assetDecimals));
    let approveAmountBN = amountBN;

    if (activePercentage === 100 && maxPlan) {
      // Send what the field shows; when the chain has moved so that it no longer stands, show the new plan instead and
      // send nothing, so every transaction matches the amount on screen.
      const maxInputs = readMaxRepayInputs();
      if (!maxInputs || !maxRepayPlanStands(maxPlan, maxInputs)) {
        if (maxInputs) showMaxPlan(planMaxRepay(maxInputs));
        // The allowance check confirms the new plan's approval again.
        setIsApproved(false);
        return;
      }
      amountBN = maxPlan.assets;
      sharesAmountBN = maxPlan.shares;
      approveAmountBN = maxPlan.approveAmount;
    }

    try {
      // Step 1: Approve tokens if not already approved
      if (!isApproved) {
        console.log('Initiating approve transaction...');
        await approveTx.sendTransaction({
          abi: erc20ABIConfig.abi,
          chainId,
          address: assetAddress as `0x${string}`,
          functionName: 'approve',
          args: [marketAddress as `0x${string}`, approveAmountBN]
        });
      }
      // Step 2: Repay loan if already approved
      else if (isApproved && market && marketId && userAddress && repayAmount && !repayTx.isCompleted) {
        console.log('Initiating repay loan transaction...');
        await repayTx.sendTransaction({
          address: morphoAddress,
          abi: morphoContractConfig.abi,
          chainId,
          functionName: 'repay',
          args: [
            {
              loanToken: marketParams.loanToken,
              collateralToken: marketParams.collateralToken,
              oracle: marketParams.oracle,
              irm: marketParams.irm,
              lltv: marketParams.lltv
            },
            amountBN,
            sharesAmountBN,
            userAddress as `0x${string}`,
            '' as `0x${string}`
          ]
        });
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      if (!isApproved) {
        dispatchError(intl.formatMessage({ id: 'tx.approveError' }, { symbol: market.loanAsset.symbol }));
      } else {
        dispatchError(intl.formatMessage({ id: 'repay.error' }, { symbol: market.loanAsset.symbol }));
      }
      resetTransactionStates();
      setTxError(
        intl.formatMessage(
          { id: 'tx.failed' },
          { message: error instanceof Error ? error.message : intl.formatMessage({ id: 'tx.unknownError' }) }
        )
      );
    }
  }, [
    userAddress,
    marketId,
    repayAmount,
    market,
    isApproved,
    chainId,
    morphoAddress,
    marketParams,
    approveTx,
    repayTx,
    resetTransactionStates,
    intl,
    debouncedRepayAmount,
    activePercentage,
    maxPlan,
    readMaxRepayInputs,
    showMaxPlan
  ]);

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
      return intl.formatMessage({ id: 'common.checkingAllowance' });
    }

    if (!repayAmount) {
      return intl.formatMessage({ id: 'common.enterAmount' });
    }

    if (!isApproved) {
      if (approveTx.txState === 'submitting' || approveTx.txState === 'submitted') {
        return intl.formatMessage({ id: 'common.approving' });
      }
      if (approveTx.txState === 'error') {
        return intl.formatMessage({ id: 'common.approvalFailed' });
      }
      return intl.formatMessage({ id: 'common.approve' }, { symbol: market?.loanAsset.symbol || '' });
    }

    if (repayTx.txState === 'submitting' || repayTx.txState === 'submitted') {
      return intl.formatMessage({ id: 'repay.pending' });
    }
    if (repayTx.txState === 'error') {
      return intl.formatMessage({ id: 'repay.failed' });
    }

    return intl.formatMessage({ id: 'repay.button' });
  }, [repayAmount, isApproved, allowanceChecking, approveTx.txState, repayTx.txState, market?.loanAsset.symbol, intl]);

  // Determine if button should be disabled
  const isButtonDisabled = useCallback(() => {
    if (!marketParams || !morphoAddress) return true;
    if (!repayAmount || parseFloat(repayAmount) <= 0) return true;
    // A Max plan is capped at the debt by construction; the debt shown can lag it on a quiet market.
    if (!maxPlan && parseFloat(repayAmount) > parseFloat(formattedLoanBalance)) return true;
    if (parseFloat(repayAmount) > parseFloat(formattedUserBalance)) return true;

    // Disable during allowance checking (debounce period)
    if (allowanceChecking) return true;

    // Disable during transactions
    if (isTransactionInProgress) return true;

    return false;
  }, [
    repayAmount,
    formattedLoanBalance,
    formattedUserBalance,
    allowanceChecking,
    isTransactionInProgress,
    marketParams,
    morphoAddress,
    maxPlan
  ]);

  // Determine if input and percentage buttons should be disabled
  const isInputDisabled = isTransactionInProgress;

  const loanSymbol = market?.loanAsset?.symbol || intl.formatMessage({ id: 'common.tokenLower' });
  const exceedsLoan = !maxPlan && !!repayAmount && parseFloat(repayAmount) > parseFloat(formattedLoanBalance);
  const exceedsWallet = !!repayAmount && parseFloat(repayAmount) > parseFloat(formattedUserBalance);
  // Surfaced to assistive tech / automation only: the visual design has no slot
  // for these messages, but the state itself is real and must be machine readable.
  const statusMessage =
    txError ||
    (exceedsLoan ? intl.formatMessage({ id: 'repay.exceedsLoan' }, { symbol: loanSymbol }) : '') ||
    (exceedsWallet ? intl.formatMessage({ id: 'repay.exceedsWallet' }, { symbol: loanSymbol }) : '');

  if (!market) {
    return (
      <Box>
        <FormattedMessage id="market.incorrectData" />
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
              <FormattedMessage id="repay.title" />
            </Typography>
            <Typography variant="body2">
              <FormattedMessage id="repay.amountLabel" />
            </Typography>
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
                avatarProps={{ sx: { width: 45, height: 45 }, alt: '' }}
                symbol={market.loanAsset?.symbol}
              />
            )}
            <Typography fontWeight="bold">{market.loanAsset?.symbol || intl.formatMessage({ id: 'common.na' })}</Typography>
          </Box>
        </Box>
        <CustomInput
          autoFocus
          type="text"
          fullWidth
          value={inputAmount}
          onChange={(e) => {
            let val = formatAssetOutput(e.target.value);
            // State keeps the dot form: parseFloat("0,5") is 0 and would keep the button disabled.
            setRepayAmount(normalizePointAmount(val));
            setInputAmount(val);
            // Clear active percentage when user manually enters a value
            if (activePercentage !== null) {
              setActivePercentage(null);
            }
            setMaxPlan(null);
          }}
          disabled={isInputDisabled}
          placeholder="0"
          inputProps={{
            inputMode: 'decimal',
            pattern: '[0-9]*,?[0-9]*',
            id: 'repay-amount',
            'aria-label': intl.formatMessage({ id: 'repay.inputAria' }, { symbol: loanSymbol }),
            'aria-describedby': 'repay-balances repay-status',
            'aria-invalid': exceedsLoan || exceedsWallet || undefined
          }}
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
            aria-pressed={activePercentage === 25}
            aria-label={intl.formatMessage({ id: 'repay.percentAria' }, { percent: 25, symbol: loanSymbol })}
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
            aria-pressed={activePercentage === 50}
            aria-label={intl.formatMessage({ id: 'repay.percentAria' }, { percent: 50, symbol: loanSymbol })}
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
            aria-pressed={activePercentage === 75}
            aria-label={intl.formatMessage({ id: 'repay.percentAria' }, { percent: 75, symbol: loanSymbol })}
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
            aria-pressed={activePercentage === 100}
            aria-label={intl.formatMessage({ id: 'repay.maxAria' }, { symbol: loanSymbol })}
            sx={{
              flex: 1,
              bgcolor: activePercentage === 100 ? theme.palette.secondary.main : 'transparent',
              color: activePercentage === 100 ? theme.palette.background.paper : 'inherit'
            }}
          >
            <FormattedMessage id="common.max" />
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
          id="repay-balances"
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
              <FormattedMessage id="repay.loan" />
            </Typography>
            <Typography variant="h4" fontWeight="normal">
              {formatAssetOutput(Number(formattedLoanBalance).toFixed(6))}{' '}
              {market.loanAsset?.symbol || intl.formatMessage({ id: 'common.na' })}
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
              <FormattedMessage id="common.yourBalance" />
            </Typography>
            <Typography variant="h4" fontWeight="normal">
              {formatAssetOutput(Number(formattedUserBalance).toFixed(6))}{' '}
              {market.loanAsset?.symbol || intl.formatMessage({ id: 'common.na' })}
            </Typography>
          </Box>
        </Box>
        <Box id="repay-status" role="alert" sx={visuallyHidden}>
          {statusMessage}
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleRepay}
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

export default RepayTab;
