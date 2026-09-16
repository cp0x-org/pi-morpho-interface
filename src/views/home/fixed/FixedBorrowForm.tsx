import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert } from '@mui/material';

import { useMidnightQuote } from 'hooks/midnight/useMidnightQuote';
import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import {
  applySafetyFactor,
  aprToPrice,
  computeLtv,
  computeMaxDebt,
  DEFAULT_RATE_BUFFER_WAD,
  formatMaturity,
  formatWadPercent,
  getDeadline,
  maxUnitsForBorrow,
  percentInputToWad,
  priceToApr,
  takerPrice,
  unitsToAssets,
  WAD,
  wadToPercentInput
} from 'utils/midnight';
import { approveRequest, authorizeBundlesRequest, borrowRequest } from 'utils/midnightTx';
import FixedAmountInput, {
  FixedCollateralSelect,
  FixedDetailsList,
  FixedRateInput,
  formatTokenDisplay,
  parseAmountInput
} from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE BORROW (MARKET ORDER) ||============================== //

export default function FixedBorrowForm({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, market, collaterals } = ctx;
  const [collateralIndex, setCollateralIndex] = useState(0);
  const [collateralInput, setCollateralInput] = useState('');
  const [loanInput, setLoanInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [rateTouched, setRateTouched] = useState(false);

  const collateral = collaterals[collateralIndex] ?? collaterals[0];
  const collateralAssets = parseAmountInput(collateralInput, collateral?.decimals);
  const loanAssets = parseAmountInput(loanInput, loan.decimals);
  const validCollateral = collateralAssets ?? 0n;
  const validLoan = loanAssets ?? 0n;

  const estimate = useMidnightQuote({ marketId: ctx.marketId, side: 'bids', assets: validLoan, settlementFee: ctx.settlementFee });
  const estimatedApr = estimate.quote ? priceToApr(estimate.quote.averageBestPrice, market.maturity, ctx.nowSec) : undefined;
  const suggestedMaxApr = estimatedApr != null ? estimatedApr + DEFAULT_RATE_BUFFER_WAD : undefined;

  useEffect(() => {
    if (!rateTouched && suggestedMaxApr != null) setRateInput(wadToPercentInput(suggestedMaxApr));
  }, [rateTouched, suggestedMaxApr]);

  // Maximum rate → worst (lowest) acceptable average price → guarded quote and maximum debt units.
  const maxApr = percentInputToWad(rateInput);
  const worstPrice = maxApr != null ? aprToPrice(maxApr, market.maturity, 'borrow', ctx.nowSec) : undefined;
  const guarded = useMidnightQuote({
    marketId: ctx.marketId,
    side: 'bids',
    assets: validLoan,
    averageWorstPrice: worstPrice,
    settlementFee: ctx.settlementFee,
    enabled: worstPrice != null
  });
  const maxUnits = worstPrice != null && validLoan > 0n ? maxUnitsForBorrow(validLoan, worstPrice) : undefined;
  const expectedUnits = estimate.quote && validLoan > 0n ? maxUnitsForBorrow(validLoan, estimate.quote.averageBestPrice) : undefined;

  // Health preview, worst case: the whole unit cap becomes debt.
  const debtBefore = ctx.position?.debt ?? 0n;
  const holdingsBefore = collaterals.map((item) => ({ amount: item.positionAmount, oraclePrice: item.oraclePrice, lltv: item.lltv }));
  const holdingsAfter = holdingsBefore.map((holding, index) =>
    index === collateral?.index ? { ...holding, amount: holding.amount + validCollateral } : holding
  );
  const debtAfter = debtBefore + (maxUnits ?? expectedUnits ?? 0n);
  const maxDebtBefore = computeMaxDebt(holdingsBefore);
  const maxDebtAfter = computeMaxDebt(holdingsAfter);
  const safeDebtAfter = applySafetyFactor(maxDebtAfter);
  const ltvBefore = computeLtv(debtBefore, holdingsBefore);
  const ltvAfter = computeLtv(debtAfter, holdingsAfter);
  const exceedsSafeLimit = validLoan > 0n && debtAfter > safeDebtAfter;
  const missingOraclePrice = collaterals.some((item, index) => holdingsAfter[index].amount > 0n && item.oraclePrice == null);
  const exceedsCollateralBalance = !!ctx.user && collateral?.walletBalance != null && validCollateral > collateral.walletBalance;

  // Percent buttons on the loan field: what the safe capacity can back at the best bid.
  const bestBid = ctx.book?.bids[0];
  const capacityUnits = safeDebtAfter > debtBefore ? safeDebtAfter - debtBefore : 0n;
  const capacityAssets = bestBid ? unitsToAssets(capacityUnits, takerPrice('borrow', bestBid.price, ctx.settlementFee), 'Down') : undefined;

  const latest = useRef({
    quote: guarded.quote,
    maxUnits,
    loanAssets: validLoan,
    collateralAssets: validCollateral,
    collateralIndex: collateral?.index ?? 0
  });
  latest.current = {
    quote: guarded.quote,
    maxUnits,
    loanAssets: validLoan,
    collateralAssets: validCollateral,
    collateralIndex: collateral?.index ?? 0
  };

  const steps = useMemo<TxStep[]>(() => {
    const { user, midnightBundles } = ctx;
    if (!user || !midnightBundles || !collateral || validLoan === 0n) return [];
    const list: TxStep[] = [];
    if (validCollateral > 0n && (collateral.allowanceBundles ?? 0n) < validCollateral) {
      list.push({
        key: 'approve',
        label: intl.formatMessage({ id: 'fixed.tx.approve' }, { symbol: collateral.symbol }),
        build: () => approveRequest(ctx.chainId, collateral.token, midnightBundles, latest.current.collateralAssets)
      });
    }
    if (!ctx.isBundlesAuthorized) {
      list.push({
        key: 'authorize',
        label: intl.formatMessage({ id: 'fixed.tx.authorize' }),
        build: () => authorizeBundlesRequest(ctx.chainId, user)
      });
    }
    list.push({
      key: 'borrow',
      label: intl.formatMessage({ id: 'fixed.borrow.button' }),
      build: () => {
        const current = latest.current;
        if (!current.quote || current.maxUnits == null) throw new Error(intl.formatMessage({ id: 'fixed.tx.quoteExpired' }));
        return borrowRequest({
          chainId: ctx.chainId,
          marketId: ctx.marketId,
          marketParams: ctx.marketParams,
          user,
          loanAssets: current.loanAssets,
          maxUnits: current.maxUnits,
          collateralIndex: current.collateralIndex,
          collateralAssets: current.collateralAssets,
          takeableOffers: current.quote.takeableOffers,
          deadline: getDeadline()
        });
      }
    });
    return list;
  }, [ctx, collateral, validLoan, validCollateral, intl]);

  if (!collateral) return null;

  const maturity = formatMaturity(intl, market.maturity, ctx.nowSec);
  const disabled =
    ctx.isMatured ||
    loanAssets === undefined ||
    collateralAssets === undefined ||
    validLoan === 0n ||
    exceedsCollateralBalance ||
    exceedsSafeLimit ||
    missingOraclePrice ||
    !guarded.quote ||
    guarded.isLoading ||
    maxUnits == null ||
    maxApr == null;

  const formatLtv = (value?: bigint) => (value == null ? '-' : (formatWadPercent(value) ?? '-'));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Alert severity="info">
        {intl.formatMessage(
          { id: 'fixed.borrow.maturityNotice' },
          { date: maturity.date, penalty: formatWadPercent(collateral.maxLif - WAD) ?? '-' }
        )}
      </Alert>

      <FixedCollateralSelect
        id="fixed-borrow-collateral"
        label={intl.formatMessage({ id: 'fixed.form.collateralSelect' })}
        options={collaterals}
        value={collateral.index}
        onChange={(index) => {
          setCollateralIndex(index);
          setCollateralInput('');
        }}
      />

      <FixedAmountInput
        id="fixed-borrow-collateral-amount"
        title={intl.formatMessage({ id: 'fixed.borrow.collateralTitle' })}
        label={intl.formatMessage({ id: 'fixed.borrow.collateralLabel' })}
        symbol={collateral.symbol}
        logoURI={collateral.logoURI}
        decimals={collateral.decimals}
        value={collateralInput}
        onChange={setCollateralInput}
        maxAmount={ctx.user ? collateral.walletBalance : undefined}
        hint={
          ctx.user
            ? intl.formatMessage(
                { id: 'fixed.form.wallet' },
                { amount: formatTokenDisplay(collateral.walletBalance, collateral.decimals, collateral.symbol) }
              )
            : undefined
        }
        ariaLabel={intl.formatMessage({ id: 'fixed.borrow.collateralInputAria' }, { symbol: collateral.symbol })}
        describedBy="fixed-borrow-feedback"
        invalid={collateralAssets === undefined || exceedsCollateralBalance}
      />

      <FixedAmountInput
        id="fixed-borrow-amount"
        title={intl.formatMessage({ id: 'fixed.borrow.title' })}
        label={intl.formatMessage({ id: 'fixed.borrow.amountLabel' })}
        symbol={loan.symbol}
        logoURI={loan.logoURI}
        decimals={loan.decimals}
        value={loanInput}
        onChange={setLoanInput}
        maxAmount={ctx.user ? capacityAssets : undefined}
        hint={
          ctx.user && capacityAssets != null
            ? intl.formatMessage(
                { id: 'fixed.borrow.capacityHint' },
                { amount: formatTokenDisplay(capacityAssets, loan.decimals, loan.symbol) }
              )
            : undefined
        }
        ariaLabel={intl.formatMessage({ id: 'fixed.borrow.inputAria' }, { symbol: loan.symbol })}
        describedBy="fixed-borrow-feedback"
        invalid={loanAssets === undefined || exceedsSafeLimit}
      />

      <FixedRateInput
        id="fixed-borrow-max-rate"
        label={intl.formatMessage({ id: 'fixed.borrow.maxRate' })}
        value={rateInput}
        onChange={(value) => {
          setRateInput(value);
          setRateTouched(true);
        }}
        helperText={intl.formatMessage({ id: 'fixed.borrow.maxRateHelp' })}
        invalid={rateInput !== '' && maxApr == null}
      />

      <Box id="fixed-borrow-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {(loanAssets === undefined || collateralAssets === undefined) && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>
        )}
        {exceedsCollateralBalance && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.exceedsBalance' }, { symbol: collateral.symbol })}</Alert>
        )}
        {exceedsSafeLimit && <Alert severity="error">{intl.formatMessage({ id: 'fixed.borrow.exceedsSafeLimit' })}</Alert>}
        {missingOraclePrice && <Alert severity="warning">{intl.formatMessage({ id: 'fixed.borrow.missingPrice' })}</Alert>}
        {estimate.isInsufficientLiquidity && (
          <Alert severity="warning">
            {intl.formatMessage(
              { id: 'fixed.form.insufficientLiquidity' },
              { amount: formatTokenDisplay(estimate.availableAssets ?? 0n, loan.decimals, loan.symbol) }
            )}
          </Alert>
        )}
        {!estimate.isInsufficientLiquidity && guarded.isInsufficientLiquidity && (
          <Alert severity="warning">{intl.formatMessage({ id: 'fixed.form.rateLimitLiquidity' })}</Alert>
        )}
        {(estimate.error || guarded.error) && (
          <Alert severity="error">
            {intl.formatMessage({ id: 'fixed.form.quoteError' }, { message: (estimate.error ?? guarded.error)?.message ?? '' })}
          </Alert>
        )}
      </Box>

      <FixedDetailsList
        rows={[
          { label: intl.formatMessage({ id: 'fixed.borrow.estimatedApr' }), value: formatWadPercent(estimatedApr) ?? '-' },
          {
            label: intl.formatMessage({ id: 'fixed.borrow.repayAtMaturity' }),
            value: expectedUnits != null ? formatTokenDisplay(expectedUnits, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.borrow.maxRepay' }),
            value: maxUnits != null ? formatTokenDisplay(maxUnits, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.worstPrice' }),
            value: worstPrice != null ? Number(formatUnits(worstPrice, 18)).toFixed(7) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.ltv' }),
            value: intl.formatMessage({ id: 'fixed.form.beforeAfter' }, { before: formatLtv(ltvBefore), after: formatLtv(ltvAfter) })
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.borrowCapacity' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              {
                before: formatTokenDisplay(applySafetyFactor(maxDebtBefore), loan.decimals, loan.symbol, 2),
                after: formatTokenDisplay(safeDebtAfter, loan.decimals, loan.symbol, 2)
              }
            )
          },
          { label: intl.formatMessage({ id: 'fixed.form.settlementFee' }), value: formatWadPercent(ctx.settlementFee, 4) ?? '-' }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={intl.formatMessage({ id: 'fixed.borrow.button' })}
        successMessage={intl.formatMessage({ id: 'fixed.borrow.success' }, { symbol: loan.symbol })}
        disabled={disabled}
        onSuccess={() => {
          setLoanInput('');
          setCollateralInput('');
          setRateTouched(false);
        }}
      />
    </Box>
  );
}
