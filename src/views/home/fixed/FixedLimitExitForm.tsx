import { useEffect, useMemo, useRef, useState } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { formatUnits, parseUnits } from 'viem';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, TextField, Typography } from '@mui/material';
import { TickLib } from '@morpho-org/midnight-sdk';

import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import { normalizePointAmount } from 'utils/formatters';
import {
  assetsToUnits,
  computeLtv,
  doesTickCrossBook,
  formatMaturity,
  formatWadPercent,
  getExitOfferDefaultTick,
  getOpenExitUnits,
  hasOpenEntryOrder,
  limitPriceToTick,
  MIN_OFFER_LIFETIME_SECONDS,
  nowInSeconds,
  priceToApy,
  timeToMaturity,
  tryChainAddress,
  unitsToAssets
} from 'utils/midnight';
import {
  approveRequest,
  authorizeRatifierRequest,
  buildExitOrder,
  fetchMinExitOrderAssets,
  ratifyOrderRequest,
  submitOrderRequest,
  type ExitOrder
} from 'utils/midnightTx';
import FixedAmountInput, { FixedDetailsList, formatTokenDisplay, formatTokenInput, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

/** Book prices move in steps of 1e11 wei (`PRICE_ROUNDING_STEP`), so seven decimals show any tick exactly. */
const PRICE_DECIMALS = 7;
/** Each fill rounds its payment up, so a partly filled order needs a few base units more than one fill of it would. */
const FILL_ROUNDING_HEADROOM = 1_000n;

const formatPriceInput = (priceWad: bigint) => {
  const [whole, fraction = ''] = formatUnits(priceWad, 18).split('.');
  const trimmed = fraction.slice(0, PRICE_DECIMALS).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
};

const parsePriceInput = (value: string) => {
  const normalized = normalizePointAmount(value.trim());
  if (!normalized) return undefined;
  try {
    return parseUnits(normalized, 18);
  } catch {
    return undefined;
  }
};

// ==============================|| FIXED-RATE LIMIT EARLY EXIT ||============================== //

/**
 * Early exit at the user's own price, like markets.morpho.org's Limit tab: a reduce-only offer that rests in the book
 * until maturity. A borrower offers to buy its debt back (it joins the bids, and Midnight pulls the payment from the
 * wallet when a borrower takes it); a lender offers to sell its credit (it joins the asks). Unlike a market exit it
 * needs nobody on the other side right now.
 */
export default function FixedLimitExitForm({ ctx, side }: { ctx: FixedMarketContext; side: 'lend' | 'borrow' }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, market, position, collateral } = ctx;
  const buy = side === 'borrow';
  const tickSpacing = ctx.sdkMarket?.tickSpacing;
  const isSupported = !!tryChainAddress(ctx.chainId, 'setterRatifier') && !!tryChainAddress(ctx.chainId, 'midnightMempool');

  const positionUnits = (buy ? position?.debt : position?.faceValue) ?? 0n;
  // Units already offered in open exit orders stay reserved for them: reduce-only fills never exceed the position anyway.
  const openExitUnits = getOpenExitUnits(ctx.openOrders, ctx.marketId, side);
  const availableUnits = positionUnits > openExitUnits ? positionUnits - openExitUnits : 0n;

  const [priceInput, setPriceInput] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [maxSelected, setMaxSelected] = useState(false);

  const defaultTick = getExitOfferDefaultTick(ctx.book, buy);
  useEffect(() => {
    if (!priceTouched && defaultTick != null) setPriceInput(formatPriceInput(TickLib.tickToPrice(defaultTick)));
  }, [priceTouched, defaultTick]);

  const priceWad = parsePriceInput(priceInput);
  const tick = priceWad != null && tickSpacing ? limitPriceToTick(priceWad, buy, tickSpacing) : undefined;
  const tickPrice = tick != null ? TickLib.tickToPrice(tick) : undefined;
  const orderApy = tickPrice != null ? priceToApy(tickPrice, market.maturity, ctx.nowSec) : undefined;
  // The maker trades at the tick's price exactly: the settlement fee is the taker's.
  const rounding = buy ? 'Up' : 'Down';
  const maxAssets = tickPrice != null ? unitsToAssets(availableUnits, tickPrice, rounding) : undefined;

  // Max stays "everything still free" when the price moves, so the amount shown follows it.
  useEffect(() => {
    if (maxSelected && maxAssets != null && loan.decimals != null) setAmountInput(formatTokenInput(maxAssets, loan.decimals));
  }, [maxSelected, maxAssets, loan.decimals]);

  const assets = parseAmountInput(amountInput, loan.decimals);
  const validAssets = assets ?? 0n;
  // Max offers everything still free; otherwise the units the amount pays for (or the amount asks for) at the price.
  const requestedUnits =
    tickPrice == null || validAssets === 0n
      ? 0n
      : maxSelected
        ? availableUnits
        : assetsToUnits(validAssets, tickPrice, buy ? 'Down' : 'Up');
  const exceedsPosition = requestedUnits > availableUnits;
  const units = exceedsPosition ? 0n : requestedUnits;
  const orderAssets = tickPrice != null ? unitsToAssets(units, tickPrice, rounding) : 0n;

  const walletBalance = loan.walletBalance ?? 0n;
  const spendable = walletBalance > loan.reservedByOrders ? walletBalance - loan.reservedByOrders : 0n;
  const exceedsSpendable = buy && orderAssets > spendable;

  const invalidPrice = priceInput !== '' && tick == null;
  const nearMaturity = timeToMaturity(market.maturity, ctx.nowSec) < MIN_OFFER_LIFETIME_SECONDS;
  const entryConflict = hasOpenEntryOrder(ctx.openOrders, ctx.marketId, side);
  const allInOrders = positionUnits > 0n && availableUnits === 0n;
  const crossesBook = tick != null && doesTickCrossBook(tick, buy, ctx.book);

  // The API turns down orders below a USD minimum; asked once, with a one-unit order at a valid price.
  const probeTick = tick ?? defaultTick;
  const maker = ctx.user;
  const { data: minAssets } = useQuery({
    queryKey: ['fixedMinExitOrderAssets', ctx.chainId, ctx.marketId, buy],
    queryFn:
      maker && isSupported && probeTick != null && tickSpacing
        ? () =>
            fetchMinExitOrderAssets({
              chainId: ctx.chainId,
              marketId: ctx.marketId,
              marketParams: ctx.marketParams,
              user: maker,
              buy,
              tick: probeTick,
              tickSpacing,
              continuousFeeCap: BigInt(ctx.sdkMarket?.continuousFee ?? 0),
              start: nowInSeconds()
            })
        : skipToken,
    staleTime: 5 * 60_000,
    retry: 1
  });
  const belowMinimum = !!minAssets && units > 0n && orderAssets < minAssets;
  const positionBelowMinimum = !!minAssets && maxAssets != null && maxAssets > 0n && maxAssets < minAssets;

  const unitsAfter = positionUnits > units ? positionUnits - units : 0n;
  const holding = { amount: collateral.positionAmount, oraclePrice: collateral.oraclePrice, lltv: collateral.lltv };

  // The tree is built when its approval is sent, so its offer starts then; the next step publishes that same tree.
  const order = useRef<ExitOrder>(undefined);

  const steps = useMemo<TxStep[]>(() => {
    const { user } = ctx;
    if (!user || !isSupported || tick == null || !tickSpacing || units === 0n) return [];
    const list: TxStep[] = [];
    if (buy) {
      // Midnight pulls the payment when the order fills, and every buy order draws on the same allowance.
      const needed = loan.reservedByOrders + orderAssets;
      if ((loan.allowanceMidnight ?? 0n) < needed) {
        list.push({
          key: 'approve',
          label: intl.formatMessage({ id: 'fixed.tx.approve' }, { symbol: loan.symbol }),
          build: () => approveRequest(ctx.chainId, loan.token, ctx.marketParams.midnight, needed + FILL_ROUNDING_HEADROOM)
        });
      }
    }
    if (!ctx.isSetterRatifierAuthorized) {
      list.push({
        key: 'enable',
        label: intl.formatMessage({ id: 'fixed.limit.txEnable' }),
        build: () => authorizeRatifierRequest(ctx.chainId, user)
      });
    }
    list.push({
      key: 'ratify',
      label: intl.formatMessage({ id: 'fixed.limit.txRatify' }),
      build: async () => {
        order.current = await buildExitOrder({
          chainId: ctx.chainId,
          marketId: ctx.marketId,
          marketParams: ctx.marketParams,
          user,
          buy,
          tick,
          tickSpacing,
          units,
          continuousFeeCap: BigInt(ctx.sdkMarket?.continuousFee ?? 0),
          start: nowInSeconds()
        });
        return ratifyOrderRequest(ctx.chainId, user, order.current.root);
      }
    });
    list.push({
      key: 'submit',
      label: intl.formatMessage({ id: 'fixed.limit.txSubmit' }),
      build: () => {
        if (!order.current) throw new Error(intl.formatMessage({ id: 'fixed.limit.notRatified' }));
        return submitOrderRequest(ctx.chainId, order.current.payload);
      }
    });
    return list;
  }, [ctx, isSupported, tick, tickSpacing, units, buy, orderAssets, loan, intl]);

  const disabled =
    ctx.isMatured ||
    !isSupported ||
    nearMaturity ||
    entryConflict ||
    tick == null ||
    assets === undefined ||
    units === 0n ||
    exceedsPosition ||
    exceedsSpendable ||
    belowMinimum;
  const formatUnitsDisplay = (value?: bigint) => formatTokenDisplay(value, loan.decimals, loan.symbol);
  const formatLtv = (value?: bigint) => (value == null ? '-' : (formatWadPercent(value) ?? '-'));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({ id: buy ? 'fixed.limit.borrowDescription' : 'fixed.limit.lendDescription' })}
      </Typography>
      {buy && <Alert severity="info">{intl.formatMessage({ id: 'fixed.limit.fundsNote' }, { symbol: loan.symbol })}</Alert>}

      <TextField
        id="fixed-limit-price"
        label={intl.formatMessage({ id: 'fixed.limit.priceLabel' })}
        value={priceInput}
        onChange={(event) => {
          setPriceInput(event.target.value.replace(/[^0-9.,]/g, ''));
          setPriceTouched(true);
        }}
        onBlur={() => tickPrice != null && setPriceInput(formatPriceInput(tickPrice))}
        helperText={
          invalidPrice
            ? intl.formatMessage({ id: 'fixed.limit.priceInvalid' })
            : intl.formatMessage(
                { id: buy ? 'fixed.limit.priceHelpBuy' : 'fixed.limit.priceHelpSell' },
                { apy: formatWadPercent(orderApy) ?? '-' }
              )
        }
        error={invalidPrice}
        size="small"
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />

      <FixedAmountInput
        id="fixed-limit-amount"
        title={intl.formatMessage({ id: buy ? 'fixed.limit.payTitle' : 'fixed.limit.receiveTitle' })}
        label={intl.formatMessage({ id: buy ? 'fixed.limit.payLabel' : 'fixed.limit.receiveLabel' })}
        symbol={loan.symbol}
        logoURI={loan.logoURI}
        decimals={loan.decimals}
        value={amountInput}
        onChange={setAmountInput}
        maxAmount={maxAssets}
        onPercentChange={(percent) => setMaxSelected(percent === 100)}
        hint={intl.formatMessage(
          { id: buy ? 'fixed.limit.debtHint' : 'fixed.limit.creditHint' },
          {
            position: formatUnitsDisplay(positionUnits),
            value: maxAssets != null ? formatUnitsDisplay(maxAssets) : '-',
            open: formatUnitsDisplay(openExitUnits),
            hasOpen: openExitUnits > 0n ? 'yes' : 'no'
          }
        )}
        ariaLabel={intl.formatMessage({ id: buy ? 'fixed.limit.payInputAria' : 'fixed.limit.receiveInputAria' }, { symbol: loan.symbol })}
        describedBy="fixed-limit-feedback"
        invalid={assets === undefined || exceedsPosition || exceedsSpendable || belowMinimum}
      />

      <Box id="fixed-limit-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!isSupported && <Alert severity="error">{intl.formatMessage({ id: 'fixed.limit.unsupported' })}</Alert>}
        {nearMaturity && <Alert severity="error">{intl.formatMessage({ id: 'fixed.limit.nearMaturity' })}</Alert>}
        {entryConflict && (
          <Alert severity="error">
            {intl.formatMessage({ id: buy ? 'fixed.limit.entryConflictBorrow' : 'fixed.limit.entryConflictLend' })}
          </Alert>
        )}
        {allInOrders && <Alert severity="info">{intl.formatMessage({ id: 'fixed.limit.allInOrders' })}</Alert>}
        {assets === undefined && <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>}
        {exceedsPosition && <Alert severity="error">{intl.formatMessage({ id: 'fixed.exit.exceedsPosition' })}</Alert>}
        {positionBelowMinimum ? (
          <Alert severity="info">
            {intl.formatMessage(
              { id: 'fixed.limit.positionBelowMinimum' },
              { max: formatUnitsDisplay(maxAssets), min: formatUnitsDisplay(minAssets) }
            )}
          </Alert>
        ) : (
          belowMinimum && (
            <Alert severity="error">{intl.formatMessage({ id: 'fixed.limit.belowMinimum' }, { min: formatUnitsDisplay(minAssets) })}</Alert>
          )
        )}
        {exceedsSpendable && (
          <Alert severity="error">
            {intl.formatMessage(
              { id: 'fixed.limit.exceedsSpendable' },
              { balance: formatUnitsDisplay(walletBalance), reserved: formatUnitsDisplay(loan.reservedByOrders), symbol: loan.symbol }
            )}
          </Alert>
        )}
        {crossesBook && (
          <Alert severity="warning">{intl.formatMessage({ id: buy ? 'fixed.limit.crossesBuy' : 'fixed.limit.crossesSell' })}</Alert>
        )}
      </Box>

      <FixedDetailsList
        rows={[
          {
            label: intl.formatMessage({ id: 'fixed.limit.orderPrice' }),
            value: tickPrice != null ? formatPriceInput(tickPrice) : '-'
          },
          { label: intl.formatMessage({ id: 'fixed.limit.orderApy' }), value: formatWadPercent(orderApy) ?? '-' },
          { label: intl.formatMessage({ id: 'fixed.limit.minOrder' }), value: minAssets ? formatUnitsDisplay(minAssets) : '-' },
          {
            label: intl.formatMessage({ id: buy ? 'fixed.limit.debtBought' : 'fixed.limit.creditSold' }),
            value: units > 0n ? formatUnitsDisplay(units) : '-'
          },
          {
            label: intl.formatMessage({ id: buy ? 'fixed.limit.paidOnFill' : 'fixed.limit.receivedOnFill' }),
            value: units > 0n ? formatUnitsDisplay(orderAssets) : '-'
          },
          {
            label: intl.formatMessage({ id: buy ? 'fixed.position.repayAtMaturity' : 'fixed.position.receiveAtMaturity' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              { before: formatUnitsDisplay(positionUnits), after: formatUnitsDisplay(unitsAfter) }
            )
          },
          ...(buy
            ? [
                {
                  label: intl.formatMessage({ id: 'fixed.form.ltv' }),
                  value: intl.formatMessage(
                    { id: 'fixed.form.beforeAfter' },
                    { before: formatLtv(computeLtv(positionUnits, holding)), after: formatLtv(computeLtv(unitsAfter, holding)) }
                  )
                }
              ]
            : []),
          {
            label: intl.formatMessage({ id: 'fixed.limit.expires' }),
            value: formatMaturity(intl, market.maturity, ctx.nowSec).date
          }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={intl.formatMessage({ id: 'fixed.limit.button' })}
        successMessage={intl.formatMessage({ id: 'fixed.limit.success' })}
        disabled={disabled}
        onSuccess={() => {
          setAmountInput('');
          setMaxSelected(false);
          order.current = undefined;
        }}
      />
    </Box>
  );
}
