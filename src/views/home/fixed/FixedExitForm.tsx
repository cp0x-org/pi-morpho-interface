import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, Typography } from '@mui/material';

import { useMidnightQuote } from 'hooks/midnight/useMidnightQuote';
import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import {
  aprToPrice,
  DEFAULT_RATE_BUFFER_WAD,
  formatWadPercent,
  getDeadline,
  percentInputToWad,
  priceToApr,
  unitsToAssets,
  wadToPercentInput
} from 'utils/midnight';
import { approveRequest, authorizeBundlesRequest, closeBorrowRequest, exitLendRequest } from 'utils/midnightTx';
import FixedAmountInput, { FixedDetailsList, FixedRateInput, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE EARLY EXIT ||============================== //

/**
 * Before maturity: a lender sells credit into bids, a borrower buys its debt back from asks.
 * Both take order book offers through MidnightBundles in reduce-only mode.
 */
export default function FixedExitForm({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, market, position } = ctx;
  const mode: 'lend' | 'borrow' = (position?.debt ?? 0n) > 0n ? 'borrow' : 'lend';
  const holding = mode === 'borrow' ? (position?.debt ?? 0n) : (position?.faceValue ?? 0n);
  // Selling units is priced like a borrow (a lower price is worse), buying them like a lend.
  const side = mode === 'lend' ? 'bids' : 'asks';
  const guardSide = mode === 'lend' ? 'borrow' : 'lend';
  const rounding = mode === 'lend' ? 'Down' : 'Up';

  const [unitsInput, setUnitsInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [rateTouched, setRateTouched] = useState(false);

  const units = parseAmountInput(unitsInput, loan.decimals);
  const validUnits = units ?? 0n;

  const estimate = useMidnightQuote({ marketId: ctx.marketId, side, units: validUnits, settlementFee: ctx.settlementFee });
  const estimatedApr = estimate.quote ? priceToApr(estimate.quote.averageBestPrice, market.maturity, ctx.nowSec) : undefined;
  const suggestedApr =
    estimatedApr == null
      ? undefined
      : mode === 'lend'
        ? estimatedApr + DEFAULT_RATE_BUFFER_WAD
        : estimatedApr > DEFAULT_RATE_BUFFER_WAD
          ? estimatedApr - DEFAULT_RATE_BUFFER_WAD
          : 0n;

  useEffect(() => {
    if (!rateTouched && suggestedApr != null) setRateInput(wadToPercentInput(suggestedApr));
  }, [rateTouched, suggestedApr]);

  const limitApr = percentInputToWad(rateInput);
  const worstPrice = limitApr != null ? aprToPrice(limitApr, market.maturity, guardSide, ctx.nowSec) : undefined;
  const guarded = useMidnightQuote({
    marketId: ctx.marketId,
    side,
    units: validUnits,
    averageWorstPrice: worstPrice,
    settlementFee: ctx.settlementFee,
    enabled: worstPrice != null
  });

  const expectedAssets =
    estimate.quote && validUnits > 0n ? unitsToAssets(validUnits, estimate.quote.averageBestPrice, rounding) : undefined;
  // lend: minimum seller assets; borrow: maximum buyer assets
  const boundAssets = worstPrice != null && validUnits > 0n ? unitsToAssets(validUnits, worstPrice, rounding) : undefined;
  const exceedsPosition = validUnits > holding;
  const exceedsWallet = mode === 'borrow' && boundAssets != null && boundAssets > (loan.walletBalance ?? 0n);

  const latest = useRef({ quote: guarded.quote, units: validUnits, boundAssets });
  latest.current = { quote: guarded.quote, units: validUnits, boundAssets };

  const steps = useMemo<TxStep[]>(() => {
    const { user, midnightBundles } = ctx;
    if (!user || !midnightBundles || validUnits === 0n) return [];
    const list: TxStep[] = [];
    if (mode === 'borrow' && boundAssets != null && (loan.allowanceBundles ?? 0n) < boundAssets) {
      list.push({
        key: 'approve',
        label: intl.formatMessage({ id: 'fixed.tx.approve' }, { symbol: loan.symbol }),
        build: () => approveRequest(ctx.chainId, loan.token, midnightBundles, latest.current.boundAssets ?? 0n)
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
      label: intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.lendButton' : 'fixed.exit.borrowButton' }),
      build: () => {
        const current = latest.current;
        if (!current.quote || current.boundAssets == null) throw new Error(intl.formatMessage({ id: 'fixed.tx.quoteExpired' }));
        const target = { chainId: ctx.chainId, marketId: ctx.marketId, marketParams: ctx.marketParams, user, deadline: getDeadline() };
        return mode === 'lend'
          ? exitLendRequest({
              ...target,
              units: current.units,
              minSellerAssets: current.boundAssets,
              takeableOffers: current.quote.takeableOffers
            })
          : closeBorrowRequest({
              ...target,
              units: current.units,
              maxBuyerAssets: current.boundAssets,
              takeableOffers: current.quote.takeableOffers,
              withdrawals: []
            });
      }
    });
    return list;
  }, [ctx, mode, boundAssets, loan.allowanceBundles, loan.symbol, loan.token, validUnits, intl]);

  const difference =
    expectedAssets != null ? (validUnits > expectedAssets ? validUnits - expectedAssets : expectedAssets - validUnits) : undefined;
  const disabled =
    ctx.isMatured ||
    units === undefined ||
    validUnits === 0n ||
    exceedsPosition ||
    exceedsWallet ||
    !guarded.quote ||
    guarded.isLoading ||
    boundAssets == null ||
    limitApr == null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.lendDescription' : 'fixed.exit.borrowDescription' })}
      </Typography>
      <Alert severity="info">{intl.formatMessage({ id: 'fixed.exit.smallAmountsNote' })}</Alert>

      <FixedAmountInput
        id="fixed-exit-units"
        title={intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.lendTitle' : 'fixed.exit.borrowTitle' })}
        label={intl.formatMessage({ id: 'fixed.exit.unitsLabel' })}
        symbol={loan.symbol}
        logoURI={loan.logoURI}
        decimals={loan.decimals}
        value={unitsInput}
        onChange={setUnitsInput}
        maxAmount={holding}
        ariaLabel={intl.formatMessage({ id: 'fixed.exit.inputAria' }, { symbol: loan.symbol })}
        describedBy="fixed-exit-feedback"
        invalid={units === undefined || exceedsPosition}
      />

      <FixedRateInput
        id="fixed-exit-rate"
        label={intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.maxRate' : 'fixed.exit.minRate' })}
        value={rateInput}
        onChange={(value) => {
          setRateInput(value);
          setRateTouched(true);
        }}
        helperText={intl.formatMessage({ id: 'fixed.exit.rateHelp' })}
        invalid={rateInput !== '' && limitApr == null}
      />

      <Box id="fixed-exit-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {units === undefined && <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>}
        {exceedsPosition && <Alert severity="error">{intl.formatMessage({ id: 'fixed.exit.exceedsPosition' })}</Alert>}
        {exceedsWallet && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.exceedsBalance' }, { symbol: loan.symbol })}</Alert>
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
          {
            label: intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.holdToMaturity' : 'fixed.exit.repayAtPar' }),
            value: validUnits > 0n ? formatTokenDisplay(validUnits, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.exitNow' : 'fixed.exit.closeViaMarket' }),
            value: expectedAssets != null ? formatTokenDisplay(expectedAssets, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({
              id:
                mode === 'borrow' && expectedAssets != null && expectedAssets < validUnits
                  ? 'fixed.exit.cheaperBy'
                  : 'fixed.exit.difference'
            }),
            value: difference != null ? formatTokenDisplay(difference, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.minReceived' : 'fixed.exit.maxPaid' }),
            value: boundAssets != null ? formatTokenDisplay(boundAssets, loan.decimals, loan.symbol) : '-'
          },
          { label: intl.formatMessage({ id: 'fixed.lend.estimatedApr' }), value: formatWadPercent(estimatedApr) ?? '-' },
          {
            label: intl.formatMessage({ id: 'fixed.form.worstPrice' }),
            value: worstPrice != null ? Number(formatUnits(worstPrice, 18)).toFixed(7) : '-'
          }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={intl.formatMessage({ id: mode === 'lend' ? 'fixed.exit.lendButton' : 'fixed.exit.borrowButton' })}
        successMessage={intl.formatMessage({ id: 'fixed.exit.success' })}
        disabled={disabled}
        onSuccess={() => {
          setUnitsInput('');
          setRateTouched(false);
        }}
      />
    </Box>
  );
}
