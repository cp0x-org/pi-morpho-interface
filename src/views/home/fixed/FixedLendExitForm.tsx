import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, Typography } from '@mui/material';

import { useMidnightQuote } from 'hooks/midnight/useMidnightQuote';
import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import {
  apyToPrice,
  DEFAULT_RATE_BUFFER_WAD,
  formatRateBound,
  formatWadPercent,
  getDeadline,
  percentInputToWad,
  priceToApy,
  rateLimitGuard,
  unitsToAssets,
  wadToPercentInput
} from 'utils/midnight';
import { authorizeBundlesRequest, exitLendRequest } from 'utils/midnightTx';
import FixedAmountInput, { FixedDetailsList, FixedRateInput, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE LEND EARLY EXIT ||============================== //

/**
 * Before maturity a lender sells credit into bids through MidnightBundles in reduce-only mode, receiving at least the
 * amount its maximum rate allows. Nothing is pulled from the wallet, so there is nothing to approve.
 */
export default function FixedLendExitForm({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, market, position } = ctx;
  const holding = position?.faceValue ?? 0n;

  const [unitsInput, setUnitsInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [rateTouched, setRateTouched] = useState(false);

  const units = parseAmountInput(unitsInput, loan.decimals);
  const validUnits = units ?? 0n;

  const estimate = useMidnightQuote({ marketId: ctx.marketId, side: 'bids', units: validUnits, settlementFee: ctx.settlementFee });
  const estimatedApy = estimate.quote ? priceToApy(estimate.quote.averageBestPrice, market.maturity, ctx.nowSec) : undefined;
  const suggestedApy = estimatedApy != null ? estimatedApy + DEFAULT_RATE_BUFFER_WAD : undefined;

  useEffect(() => {
    if (!rateTouched && suggestedApy != null) setRateInput(wadToPercentInput(suggestedApy));
  }, [rateTouched, suggestedApy]);

  // Selling credit takes bids like a borrower does: a level clicked on the bids side lands here as the maximum rate.
  const ratePick = ctx.ratePick?.side === 'borrow' ? ctx.ratePick : undefined;
  const appliedPick = useRef<number>(undefined);
  useEffect(() => {
    if (!ratePick || ratePick.nonce === appliedPick.current) return;
    appliedPick.current = ratePick.nonce;
    setRateInput(ratePick.percent);
    setRateTouched(true);
  }, [ratePick]);

  // Maximum rate → lowest average price accepted.
  const limitApy = percentInputToWad(rateInput);
  const limitGuard = rateLimitGuard(estimatedApy, limitApy, 'borrow');
  const worstPrice = limitApy != null ? apyToPrice(limitApy, market.maturity, 'borrow', ctx.nowSec) : undefined;
  const guarded = useMidnightQuote({
    marketId: ctx.marketId,
    side: 'bids',
    units: validUnits,
    averageWorstPrice: worstPrice,
    settlementFee: ctx.settlementFee,
    enabled: worstPrice != null
  });

  const expectedAssets = estimate.quote && validUnits > 0n ? unitsToAssets(validUnits, estimate.quote.averageBestPrice, 'Down') : undefined;
  const minSellerAssets = worstPrice != null && validUnits > 0n ? unitsToAssets(validUnits, worstPrice, 'Down') : undefined;
  const exceedsPosition = validUnits > holding;

  // Only the offers are read at send time; the amounts come from the render the steps were built in.
  const latestQuote = useRef(guarded.quote);
  latestQuote.current = guarded.quote;

  const steps = useMemo<TxStep[]>(() => {
    const { user, midnightBundles } = ctx;
    if (!user || !midnightBundles || validUnits === 0n || minSellerAssets == null) return [];
    const list: TxStep[] = [];
    if (!ctx.isBundlesAuthorized) {
      list.push({
        key: 'authorize',
        label: intl.formatMessage({ id: 'fixed.tx.authorize' }),
        build: () => authorizeBundlesRequest(ctx.chainId, user)
      });
    }
    list.push({
      key: 'exit',
      label: intl.formatMessage({ id: 'fixed.exit.lendButton' }),
      build: () => {
        const quote = latestQuote.current;
        if (!quote) throw new Error(intl.formatMessage({ id: 'fixed.tx.quoteExpired' }));
        return exitLendRequest({
          chainId: ctx.chainId,
          marketId: ctx.marketId,
          marketParams: ctx.marketParams,
          user,
          deadline: getDeadline(),
          units: validUnits,
          minSellerAssets,
          takeableOffers: quote.takeableOffers
        });
      }
    });
    return list;
  }, [ctx, validUnits, minSellerAssets, intl]);

  const difference =
    expectedAssets != null ? (validUnits > expectedAssets ? validUnits - expectedAssets : expectedAssets - validUnits) : undefined;
  const disabled =
    ctx.isMatured ||
    units === undefined ||
    validUnits === 0n ||
    exceedsPosition ||
    !guarded.quote ||
    guarded.isLoading ||
    minSellerAssets == null ||
    limitApy == null ||
    !!limitGuard?.exceeded;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({ id: 'fixed.exit.lendDescription' })}
      </Typography>
      <Alert severity="info">{intl.formatMessage({ id: 'fixed.exit.smallAmountsNote' })}</Alert>

      <FixedAmountInput
        id="fixed-exit-units"
        title={intl.formatMessage({ id: 'fixed.exit.lendTitle' })}
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
        label={intl.formatMessage({ id: 'fixed.exit.maxRate' })}
        value={rateInput}
        onChange={(value) => {
          setRateInput(value);
          setRateTouched(true);
        }}
        helperText={intl.formatMessage({ id: 'fixed.exit.rateHelp' })}
        invalid={rateInput !== '' && limitApy == null}
      />

      <Box id="fixed-exit-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {units === undefined && <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>}
        {exceedsPosition && <Alert severity="error">{intl.formatMessage({ id: 'fixed.exit.exceedsPosition' })}</Alert>}
        {limitGuard?.exceeded && (
          <Alert severity="error">
            {intl.formatMessage(
              { id: 'fixed.form.maxRateTooHigh' },
              {
                limit: formatWadPercent(limitApy) ?? '-',
                quote: formatWadPercent(estimatedApy) ?? '-',
                bound: formatRateBound(limitGuard.bound, 'borrow')
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
          {
            label: intl.formatMessage({ id: 'fixed.exit.holdToMaturity' }),
            value: validUnits > 0n ? formatTokenDisplay(validUnits, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.exit.exitNow' }),
            value: expectedAssets != null ? formatTokenDisplay(expectedAssets, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.exit.difference' }),
            value: difference != null ? formatTokenDisplay(difference, loan.decimals, loan.symbol) : '-'
          },
          {
            label: intl.formatMessage({ id: 'fixed.exit.minReceived' }),
            value: minSellerAssets != null ? formatTokenDisplay(minSellerAssets, loan.decimals, loan.symbol) : '-'
          },
          { label: intl.formatMessage({ id: 'fixed.lend.estimatedApr' }), value: formatWadPercent(estimatedApy) ?? '-' },
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
        actionLabel={intl.formatMessage({ id: 'fixed.exit.lendButton' })}
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
