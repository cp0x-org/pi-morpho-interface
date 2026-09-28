import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, Typography } from '@mui/material';

import { useMidnightQuote } from 'hooks/midnight/useMidnightQuote';
import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import {
  apyToPrice,
  computeLtv,
  DEFAULT_RATE_BUFFER_WAD,
  formatRateBound,
  formatWadPercent,
  getDeadline,
  getOpenBorrowUnits,
  maxWithdrawableCollateral,
  minUnitsForLend,
  percentInputToWad,
  priceToApy,
  rateLimitGuard,
  unitsToAssets,
  wadToPercentInput
} from 'utils/midnight';
import {
  approveRequest,
  authorizeBundlesRequest,
  closeBorrowRequest,
  exitBorrowWithAssetsRequest,
  withdrawCollateralRequest
} from 'utils/midnightTx';
import FixedAmountInput, { FixedDetailsList, FixedRateInput, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE BORROW EARLY EXIT ||============================== //

/**
 * Early exit of a loan, as on markets.morpho.org: you enter the loan tokens you pay now and buy that much debt back from
 * asks; Max is what buying back all of it costs. Collateral can leave in the same bundle, or on its own.
 *
 * What MidnightBundles pulls is fixed once per run and approved as is: exactly the amount entered for a partial exit
 * (`BuyWithAssetsTarget`), the rate-limit bound for a full one (`BuyWithUnitsTarget`, which pulls its whole
 * `maxBuyerAssets` up front and refunds the rest). Recomputing it between the approval and the exit is what used to
 * ask for a few wei more than approved.
 */
export default function FixedBorrowExitForm({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, market, position, collateral } = ctx;
  const debt = position?.debt ?? 0n;

  const [assetsInput, setAssetsInput] = useState('');
  const [maxSelected, setMaxSelected] = useState(false);
  const [withdrawInput, setWithdrawInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [rateTouched, setRateTouched] = useState(false);

  // What buying back the whole debt costs at the best asks: the base of the percent buttons.
  const fullQuote = useMidnightQuote({ marketId: ctx.marketId, side: 'asks', units: debt, settlementFee: ctx.settlementFee });
  // Rounded down like markets.morpho.org shows it; a full exit is sent by units, so this is display and threshold only.
  const fullCost = fullQuote.quote ? unitsToAssets(debt, fullQuote.quote.averageBestPrice, 'Down') : undefined;
  // When the asks are too thin to buy all of it back, the buttons spend at most what they hold: a partial exit.
  const thinBook = fullQuote.isInsufficientLiquidity;
  const maxPay = fullCost ?? (thinBook ? fullQuote.availableAssets : undefined);

  const assets = parseAmountInput(assetsInput, loan.decimals);
  const validAssets = assets ?? 0n;
  // Max, or an amount covering the whole cost, closes the loan by its units, so no dust of debt is left behind.
  const isFullExit = validAssets > 0n && fullCost != null && (maxSelected || validAssets >= fullCost);
  const partialQuote = useMidnightQuote({
    marketId: ctx.marketId,
    side: 'asks',
    assets: validAssets,
    settlementFee: ctx.settlementFee,
    enabled: validAssets > 0n && !isFullExit
  });
  const estimate = isFullExit ? fullQuote : partialQuote;
  const estimatedApy = estimate.quote ? priceToApy(estimate.quote.averageBestPrice, market.maturity, ctx.nowSec) : undefined;
  const suggestedApy =
    estimatedApy == null ? undefined : estimatedApy > DEFAULT_RATE_BUFFER_WAD ? estimatedApy - DEFAULT_RATE_BUFFER_WAD : 0n;

  useEffect(() => {
    if (!rateTouched && suggestedApy != null) setRateInput(wadToPercentInput(suggestedApy));
  }, [rateTouched, suggestedApy]);

  // Buying debt back takes asks like a lender does: a level clicked on the asks side lands here as the minimum rate.
  const ratePick = ctx.ratePick?.side === 'lend' ? ctx.ratePick : undefined;
  const appliedPick = useRef<number>(undefined);
  useEffect(() => {
    if (!ratePick || ratePick.nonce === appliedPick.current) return;
    appliedPick.current = ratePick.nonce;
    setRateInput(ratePick.percent);
    setRateTouched(true);
  }, [ratePick]);

  // Minimum rate → highest average price accepted.
  const limitApy = percentInputToWad(rateInput);
  const limitGuard = rateLimitGuard(estimatedApy, limitApy, 'lend');
  const worstPrice = limitApy != null ? apyToPrice(limitApy, market.maturity, 'lend', ctx.nowSec) : undefined;
  const guarded = useMidnightQuote({
    marketId: ctx.marketId,
    side: 'asks',
    ...(isFullExit ? { units: debt } : { assets: validAssets }),
    averageWorstPrice: worstPrice,
    settlementFee: ctx.settlementFee,
    enabled: worstPrice != null && validAssets > 0n
  });

  // Full exit: all the debt, paying at most the bound. Partial: exactly the amount entered, for at least `minUnits`.
  const maxBuyerAssets = isFullExit && worstPrice != null ? unitsToAssets(debt, worstPrice, 'Up') : undefined;
  const minUnits = !isFullExit && worstPrice != null && validAssets > 0n ? minUnitsForLend(validAssets, worstPrice) : undefined;
  const pulledAssets = isFullExit ? maxBuyerAssets : validAssets > 0n ? validAssets : undefined;
  const expectedUnits = isFullExit
    ? debt
    : estimate.quote && validAssets > 0n
      ? minUnitsForLend(validAssets, estimate.quote.averageBestPrice)
      : undefined;
  const expectedCost = isFullExit ? fullCost : validAssets > 0n ? validAssets : undefined;
  const exceedsDebt = !isFullExit && expectedUnits != null && expectedUnits > debt;
  const exceedsWallet = pulledAssets != null && pulledAssets > (loan.walletBalance ?? 0n);

  // Collateral that can leave: what the debt still owed after the exit (plus any open borrow order) does not need.
  // A partial exit counts only the units the rate limit guarantees.
  const retiredUnits = isFullExit ? debt : (minUnits ?? 0n);
  const debtAfter = debt > retiredUnits ? debt - retiredUnits : 0n;
  const collateralHolding = { amount: collateral.positionAmount, oraclePrice: collateral.oraclePrice, lltv: collateral.lltv };
  const maxWithdraw = maxWithdrawableCollateral(collateralHolding, debtAfter + getOpenBorrowUnits(ctx.openOrders, ctx.marketId));
  const withdrawAssets = parseAmountInput(withdrawInput, collateral.decimals);
  const validWithdraw = withdrawAssets ?? 0n;
  const exceedsWithdrawable = validWithdraw > maxWithdraw;
  const collateralAfter = {
    ...collateralHolding,
    amount: collateralHolding.amount > validWithdraw ? collateralHolding.amount - validWithdraw : 0n
  };
  const withdrawOnly = validAssets === 0n && validWithdraw > 0n;

  // Only the offers are read at send time; every amount comes from the render the steps were built in (see below).
  const latestQuote = useRef(guarded.quote);
  latestQuote.current = guarded.quote;

  const steps = useMemo<TxStep[]>(() => {
    const { user, midnightBundles } = ctx;
    if (!user) return [];
    const target = { chainId: ctx.chainId, marketId: ctx.marketId, marketParams: ctx.marketParams, user };
    if (withdrawOnly) {
      return [
        {
          key: 'withdraw',
          label: intl.formatMessage({ id: 'fixed.collateral.withdrawButton' }),
          build: () => withdrawCollateralRequest({ ...target, collateralIndex: collateral.index, assets: validWithdraw })
        }
      ];
    }
    // The amounts below are this render's, and a run keeps the list it was started with: the approval checked here,
    // the approval sent and the amount the exit pulls are one and the same number.
    if (!midnightBundles || pulledAssets == null || (isFullExit ? maxBuyerAssets == null : minUnits == null)) return [];

    const list: TxStep[] = [];
    if ((loan.allowanceBundles ?? 0n) < pulledAssets) {
      list.push({
        key: 'approve',
        label: intl.formatMessage({ id: 'fixed.tx.approve' }, { symbol: loan.symbol }),
        build: () => approveRequest(ctx.chainId, loan.token, midnightBundles, pulledAssets)
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
      key: 'exit',
      label: intl.formatMessage({ id: 'fixed.exit.borrowButton' }),
      build: () => {
        // Fresh offers, fixed amounts: the rate-limit guard inside the amounts still bounds whatever the book shows now.
        const quote = latestQuote.current;
        if (!quote) throw new Error(intl.formatMessage({ id: 'fixed.tx.quoteExpired' }));
        const withdrawals = [{ collateralIndex: collateral.index, assets: validWithdraw }];
        const deadline = getDeadline();
        return isFullExit
          ? closeBorrowRequest({
              ...target,
              deadline,
              units: debt,
              maxBuyerAssets: pulledAssets,
              takeableOffers: quote.takeableOffers,
              withdrawals
            })
          : exitBorrowWithAssetsRequest({
              ...target,
              deadline,
              assets: pulledAssets,
              minUnits: minUnits ?? 0n,
              takeableOffers: quote.takeableOffers,
              withdrawals
            });
      }
    });
    return list;
  }, [
    ctx,
    withdrawOnly,
    isFullExit,
    debt,
    pulledAssets,
    maxBuyerAssets,
    minUnits,
    validWithdraw,
    collateral.index,
    loan.allowanceBundles,
    loan.symbol,
    loan.token,
    intl
  ]);

  const savings = expectedUnits != null && expectedCost != null && expectedUnits > expectedCost ? expectedUnits - expectedCost : undefined;
  const exitBlocked =
    validAssets === 0n ||
    exceedsDebt ||
    exceedsWallet ||
    !guarded.quote ||
    guarded.isLoading ||
    pulledAssets == null ||
    (isFullExit ? maxBuyerAssets == null : minUnits == null) ||
    limitApy == null ||
    !!limitGuard?.exceeded;
  const disabled =
    ctx.isMatured || assets === undefined || withdrawAssets === undefined || exceedsWithdrawable || (!withdrawOnly && exitBlocked);
  const formatLtv = (value?: bigint) => (value == null ? '-' : (formatWadPercent(value) ?? '-'));
  // The full quote is also the buttons' base, so its failure shows before any amount is typed.
  const quoteError = estimate.error ?? guarded.error ?? fullQuote.error;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({ id: 'fixed.exit.borrowDescription' })}
      </Typography>
      <Alert severity="info">{intl.formatMessage({ id: 'fixed.exit.smallAmountsNote' })}</Alert>

      <FixedAmountInput
        id="fixed-exit-assets"
        title={intl.formatMessage({ id: 'fixed.exit.borrowTitle' })}
        label={intl.formatMessage({ id: 'fixed.exit.payLabel' })}
        symbol={loan.symbol}
        logoURI={loan.logoURI}
        decimals={loan.decimals}
        value={assetsInput}
        onChange={setAssetsInput}
        maxAmount={maxPay}
        onPercentChange={(percent) => setMaxSelected(percent === 100 && fullCost != null)}
        hint={
          thinBook
            ? intl.formatMessage(
                { id: 'fixed.exit.debtHintThinBook' },
                {
                  wallet: formatTokenDisplay(loan.walletBalance, loan.decimals, loan.symbol),
                  debt: formatTokenDisplay(debt, loan.decimals, loan.symbol),
                  amount: maxPay != null ? formatTokenDisplay(maxPay, loan.decimals, loan.symbol) : '-'
                }
              )
            : intl.formatMessage(
                { id: 'fixed.exit.debtHint' },
                {
                  wallet: formatTokenDisplay(loan.walletBalance, loan.decimals, loan.symbol),
                  debt: formatTokenDisplay(debt, loan.decimals, loan.symbol),
                  cost: fullCost != null ? formatTokenDisplay(fullCost, loan.decimals, loan.symbol) : '-'
                }
              )
        }
        ariaLabel={intl.formatMessage({ id: 'fixed.exit.payInputAria' }, { symbol: loan.symbol })}
        describedBy="fixed-exit-feedback"
        invalid={assets === undefined || exceedsDebt || exceedsWallet}
      />

      <FixedAmountInput
        id="fixed-exit-withdraw"
        title={intl.formatMessage({ id: 'fixed.manage.tabWithdrawCollateral' })}
        label={intl.formatMessage({ id: 'fixed.repay.withdrawLabel' })}
        symbol={collateral.symbol}
        logoURI={collateral.logoURI}
        decimals={collateral.decimals}
        value={withdrawInput}
        onChange={setWithdrawInput}
        maxAmount={maxWithdraw}
        hint={intl.formatMessage(
          { id: 'fixed.exit.withdrawHint' },
          { amount: formatTokenDisplay(maxWithdraw, collateral.decimals, collateral.symbol) }
        )}
        ariaLabel={intl.formatMessage({ id: 'fixed.collateral.withdrawInputAria' }, { symbol: collateral.symbol })}
        describedBy="fixed-exit-feedback"
        invalid={withdrawAssets === undefined || exceedsWithdrawable}
      />

      <FixedRateInput
        id="fixed-exit-rate"
        label={intl.formatMessage({ id: 'fixed.exit.minRate' })}
        value={rateInput}
        onChange={(value) => {
          setRateInput(value);
          setRateTouched(true);
        }}
        helperText={intl.formatMessage({ id: 'fixed.exit.rateHelp' })}
        invalid={rateInput !== '' && limitApy == null}
      />

      <Box id="fixed-exit-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {(assets === undefined || withdrawAssets === undefined) && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>
        )}
        {exceedsDebt && <Alert severity="error">{intl.formatMessage({ id: 'fixed.exit.exceedsPosition' })}</Alert>}
        {exceedsWallet && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.exceedsBalance' }, { symbol: loan.symbol })}</Alert>
        )}
        {exceedsWithdrawable && <Alert severity="error">{intl.formatMessage({ id: 'fixed.collateral.exceeds' })}</Alert>}
        {limitGuard?.exceeded && (
          <Alert severity="error">
            {intl.formatMessage(
              { id: 'fixed.form.minRateTooLow' },
              {
                limit: formatWadPercent(limitApy) ?? '-',
                quote: formatWadPercent(estimatedApy) ?? '-',
                bound: formatRateBound(limitGuard.bound, 'lend')
              }
            )}
          </Alert>
        )}
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
        {quoteError && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.quoteError' }, { message: quoteError.message })}</Alert>
        )}
      </Box>

      <FixedDetailsList
        rows={[
          {
            label: intl.formatMessage({ id: 'fixed.exit.debtRetired' }),
            value: expectedUnits != null ? formatTokenDisplay(expectedUnits, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.exit.closeViaMarket' }),
            value: expectedCost != null ? formatTokenDisplay(expectedCost, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.exit.cheaperBy' }),
            value: savings != null ? formatTokenDisplay(savings, loan.decimals, loan.symbol) : '-'
          },
          isFullExit
            ? {
                label: intl.formatMessage({ id: 'fixed.exit.maxPaid' }),
                value: maxBuyerAssets != null ? formatTokenDisplay(maxBuyerAssets, loan.decimals, loan.symbol) : '-'
              }
            : {
                label: intl.formatMessage({ id: 'fixed.exit.minRetired' }),
                value: minUnits != null ? formatTokenDisplay(minUnits, loan.decimals, loan.symbol) : '-'
              },
          { label: intl.formatMessage({ id: 'fixed.lend.estimatedApr' }), value: formatWadPercent(estimatedApy) ?? '-' },
          {
            label: intl.formatMessage({ id: 'fixed.form.worstPrice' }),
            value: worstPrice != null ? Number(formatUnits(worstPrice, 18)).toFixed(7) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.position.repayAtMaturity' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              {
                before: formatTokenDisplay(debt, loan.decimals, loan.symbol),
                after: formatTokenDisplay(debtAfter, loan.decimals, loan.symbol)
              }
            )
          },
          {
            label: intl.formatMessage({ id: 'fixed.position.collateral' }, { symbol: collateral.symbol }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              {
                before: formatTokenDisplay(collateralHolding.amount, collateral.decimals, collateral.symbol),
                after: formatTokenDisplay(collateralAfter.amount, collateral.decimals, collateral.symbol)
              }
            )
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.ltv' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              { before: formatLtv(computeLtv(debt, collateralHolding)), after: formatLtv(computeLtv(debtAfter, collateralAfter)) }
            )
          }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={intl.formatMessage({ id: withdrawOnly ? 'fixed.collateral.withdrawButton' : 'fixed.exit.borrowButton' })}
        successMessage={
          withdrawOnly
            ? intl.formatMessage({ id: 'fixed.collateral.withdrawSuccess' }, { symbol: collateral.symbol })
            : intl.formatMessage({ id: 'fixed.exit.success' })
        }
        disabled={disabled}
        onSuccess={() => {
          setAssetsInput('');
          setMaxSelected(false);
          setWithdrawInput('');
          setRateTouched(false);
        }}
      />
    </Box>
  );
}
