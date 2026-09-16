import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert } from '@mui/material';

import { useMidnightQuote } from 'hooks/midnight/useMidnightQuote';
import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import {
  apyToPrice,
  DEFAULT_RATE_BUFFER_WAD,
  formatWadPercent,
  getDeadline,
  minUnitsForLend,
  percentInputToWad,
  priceToApy,
  formatRateBound,
  rateLimitGuard,
  wadToPercentInput
} from 'utils/midnight';
import { approveRequest, authorizeBundlesRequest, lendRequest } from 'utils/midnightTx';
import FixedAmountInput, { FixedDetailsList, FixedRateInput, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE LEND (MARKET ORDER) ||============================== //

export default function FixedLendForm({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, market } = ctx;
  const [amountInput, setAmountInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [rateTouched, setRateTouched] = useState(false);

  const assets = parseAmountInput(amountInput, loan.decimals);
  const validAssets = assets ?? 0n;

  // 1. Quote without a guard: the best achievable average price for this size.
  const estimate = useMidnightQuote({ marketId: ctx.marketId, side: 'asks', assets: validAssets, settlementFee: ctx.settlementFee });
  const estimatedApy = estimate.quote ? priceToApy(estimate.quote.averageBestPrice, market.maturity, ctx.nowSec) : undefined;
  const suggestedMinApy =
    estimatedApy != null ? (estimatedApy > DEFAULT_RATE_BUFFER_WAD ? estimatedApy - DEFAULT_RATE_BUFFER_WAD : 0n) : undefined;

  // 2. Minimum rate defaults to the quote minus 0.5 points until the user edits it.
  useEffect(() => {
    if (!rateTouched && suggestedMinApy != null) setRateInput(wadToPercentInput(suggestedMinApy));
  }, [rateTouched, suggestedMinApy]);

  // A rate clicked in the order book wins over the default and counts as a manual edit, so the default
  // effect above leaves it alone. The nonce makes a repeat click re-apply after the field was edited by hand.
  const ratePick = ctx.ratePick?.side === 'lend' ? ctx.ratePick : undefined;
  const appliedPick = useRef<number>(undefined);
  useEffect(() => {
    if (!ratePick || ratePick.nonce === appliedPick.current) return;
    appliedPick.current = ratePick.nonce;
    setRateInput(ratePick.percent);
    setRateTouched(true);
  }, [ratePick]);

  // 3. Minimum rate → worst (highest) acceptable average price → guarded quote and minimum units.
  const minApy = percentInputToWad(rateInput);
  const limitGuard = rateLimitGuard(estimatedApy, minApy, 'lend');
  const worstPrice = minApy != null ? apyToPrice(minApy, market.maturity, 'lend', ctx.nowSec) : undefined;
  const guarded = useMidnightQuote({
    marketId: ctx.marketId,
    side: 'asks',
    assets: validAssets,
    averageWorstPrice: worstPrice,
    settlementFee: ctx.settlementFee,
    enabled: worstPrice != null
  });
  const minUnits = worstPrice != null && validAssets > 0n ? minUnitsForLend(validAssets, worstPrice) : undefined;
  const expectedUnits = estimate.quote && validAssets > 0n ? minUnitsForLend(validAssets, estimate.quote.averageBestPrice) : undefined;
  const exceedsBalance = !!ctx.user && loan.walletBalance != null && validAssets > loan.walletBalance;

  const latest = useRef({ quote: guarded.quote, minUnits, assets: validAssets });
  latest.current = { quote: guarded.quote, minUnits, assets: validAssets };

  const steps = useMemo<TxStep[]>(() => {
    const { user, midnightBundles } = ctx;
    if (!user || !midnightBundles || validAssets === 0n) return [];
    const list: TxStep[] = [];
    if ((loan.allowanceBundles ?? 0n) < validAssets) {
      list.push({
        key: 'approve',
        label: intl.formatMessage({ id: 'fixed.tx.approve' }, { symbol: loan.symbol }),
        build: () => approveRequest(ctx.chainId, loan.token, midnightBundles, latest.current.assets)
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
      key: 'lend',
      label: intl.formatMessage({ id: 'fixed.lend.button' }),
      build: () => {
        const { quote, minUnits: currentMinUnits, assets: currentAssets } = latest.current;
        if (!quote || currentMinUnits == null) throw new Error(intl.formatMessage({ id: 'fixed.tx.quoteExpired' }));
        return lendRequest({
          chainId: ctx.chainId,
          marketId: ctx.marketId,
          marketParams: ctx.marketParams,
          user,
          assets: currentAssets,
          minUnits: currentMinUnits,
          takeableOffers: quote.takeableOffers,
          deadline: getDeadline()
        });
      }
    });
    return list;
  }, [ctx, loan.allowanceBundles, loan.symbol, loan.token, validAssets, intl]);

  const disabled =
    assets === undefined ||
    validAssets === 0n ||
    exceedsBalance ||
    ctx.isMatured ||
    !guarded.quote ||
    guarded.isLoading ||
    minUnits == null ||
    minApy == null ||
    !!limitGuard?.exceeded;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FixedAmountInput
        id="fixed-lend-amount"
        title={intl.formatMessage({ id: 'fixed.lend.title' })}
        label={intl.formatMessage({ id: 'fixed.lend.amountLabel' })}
        symbol={loan.symbol}
        logoURI={loan.logoURI}
        decimals={loan.decimals}
        value={amountInput}
        onChange={setAmountInput}
        maxAmount={ctx.user ? loan.walletBalance : undefined}
        hint={
          ctx.user
            ? intl.formatMessage(
                { id: 'fixed.form.wallet' },
                { amount: formatTokenDisplay(loan.walletBalance, loan.decimals, loan.symbol) }
              )
            : undefined
        }
        ariaLabel={intl.formatMessage({ id: 'fixed.lend.inputAria' }, { symbol: loan.symbol })}
        describedBy="fixed-lend-feedback"
        invalid={assets === undefined || exceedsBalance}
      />

      <FixedRateInput
        id="fixed-lend-min-rate"
        label={intl.formatMessage({ id: 'fixed.lend.minRate' })}
        value={rateInput}
        onChange={(value) => {
          setRateInput(value);
          setRateTouched(true);
        }}
        helperText={intl.formatMessage({ id: 'fixed.lend.minRateHelp' })}
        invalid={rateInput !== '' && minApy == null}
      />

      <Box id="fixed-lend-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {assets === undefined && <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>}
        {exceedsBalance && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.exceedsBalance' }, { symbol: loan.symbol })}</Alert>
        )}
        {limitGuard?.exceeded && (
          <Alert severity="error">
            {intl.formatMessage(
              { id: 'fixed.form.minRateTooLow' },
              {
                limit: formatWadPercent(minApy) ?? '-',
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
        {(estimate.error || guarded.error) && (
          <Alert severity="error">
            {intl.formatMessage({ id: 'fixed.form.quoteError' }, { message: (estimate.error ?? guarded.error)?.message ?? '' })}
          </Alert>
        )}
      </Box>

      <FixedDetailsList
        rows={[
          { label: intl.formatMessage({ id: 'fixed.lend.estimatedApr' }), value: formatWadPercent(estimatedApy) ?? '-' },
          {
            label: intl.formatMessage({ id: 'fixed.lend.receiveAtMaturity' }),
            value: expectedUnits != null ? formatTokenDisplay(expectedUnits, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.lend.minReceive' }),
            value: minUnits != null ? formatTokenDisplay(minUnits, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.worstPrice' }),
            value: worstPrice != null ? Number(formatUnits(worstPrice, 18)).toFixed(7) : '-'
          },
          { label: intl.formatMessage({ id: 'fixed.form.settlementFee' }), value: formatWadPercent(ctx.settlementFee, 4) ?? '-' }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={intl.formatMessage({ id: 'fixed.lend.button' })}
        successMessage={intl.formatMessage({ id: 'fixed.lend.success' }, { symbol: loan.symbol })}
        disabled={disabled}
        onSuccess={() => {
          setAmountInput('');
          setRateTouched(false);
        }}
      />
    </Box>
  );
}
