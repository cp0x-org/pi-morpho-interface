import { useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import {
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { formatWadPercent, priceToApy, takerPrice } from 'utils/midnight';
import type { MidnightBookLevel } from 'types/midnight';
import { formatTokenDisplay } from './FixedAmountInput';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE ORDER BOOK ||============================== //
//
// Laid out like markets.morpho.org: one continuous ladder of descending rates, lend orders above the spread and
// borrow orders below it, each side running towards the spread. Sides are named after the maker, as Morpho names
// them: a bid is posted by a lender buying credit units, an ask by a borrower selling debt units. The taker is on
// the other side of each — a borrower takes bids, a lender takes asks — which is what the hint under each title says.
//
// The API returns both sides best-for-the-taker first (the highest-rate ask, the lowest-rate bid), so bids have to be
// reversed to read downwards and asks do not. Depth always accumulates from the top of the book outwards.
//
// A row is clickable: it switches the action panel to that level's taker side and puts the level's rate in the
// limit field, the same shortcut markets.morpho.org offers on its book.

/** Levels shown per side before "show the whole book": enough to read the top of the book without an inner scroll. */
const COLLAPSED_LEVELS = 8;

interface BookRow {
  tick: number;
  price: bigint;
  assets: bigint;
  cumulative: bigint;
  count: number;
  rate?: bigint;
}

const toRows = (levels: MidnightBookLevel[], taker: 'lend' | 'borrow', ctx: FixedMarketContext): BookRow[] => {
  let cumulative = 0n;
  const fromBest = levels.map((level) => {
    cumulative += level.assets;
    return {
      tick: level.tick,
      price: level.price,
      assets: level.assets,
      cumulative,
      count: level.count,
      rate: priceToApy(takerPrice(taker, level.price, ctx.settlementFee), ctx.market.maturity, ctx.nowSec)
    };
  });
  // Bids climb in rate away from the spread, asks fall: only bids need flipping to keep the ladder descending.
  return taker === 'borrow' ? fromBest.reverse() : fromBest;
};

export default function FixedOrderBook({ ctx, isLoading }: { ctx: FixedMarketContext; isLoading: boolean }) {
  const theme = useTheme();
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);

  const bids = useMemo(() => toRows(ctx.book?.bids ?? [], 'borrow', ctx), [ctx]);
  const asks = useMemo(() => toRows(ctx.book?.asks ?? [], 'lend', ctx), [ctx]);

  const bestBidRate = bids.at(-1)?.rate;
  const bestAskRate = asks[0]?.rate;
  const spread = bestBidRate != null && bestAskRate != null ? bestBidRate - bestAskRate : undefined;

  // Collapsed, each side keeps the levels next to the spread — the ones a taker actually hits first.
  // Bids run towards the spread, asks away from it, so they are trimmed from opposite ends.
  const visibleBids = expanded ? bids : bids.slice(-COLLAPSED_LEVELS);
  const visibleAsks = expanded ? asks : asks.slice(0, COLLAPSED_LEVELS);
  const hiddenLevels = bids.length + asks.length - visibleBids.length - visibleAsks.length;

  const columns = ['fixed.book.orders', 'fixed.book.rate', 'fixed.book.price', 'fixed.book.amount', 'fixed.book.total'];

  const renderSide = (rows: BookRow[], taker: 'lend' | 'borrow', titleId: string, hintId: string, color: string) => (
    <>
      <TableRow>
        <TableCell colSpan={columns.length} sx={{ borderBottom: 'none', paddingTop: 2, paddingBottom: 0.5 }}>
          <Typography variant="h5" component="h3" sx={{ color }}>
            <FormattedMessage id={titleId} />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id={hintId} />
          </Typography>
        </TableCell>
      </TableRow>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell colSpan={columns.length}>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="fixed.book.empty" />
            </Typography>
          </TableCell>
        </TableRow>
      ) : (
        rows.map((row) => {
          const rate = row.rate;
          const pick = rate != null && !ctx.isMatured ? () => ctx.pickRate(taker, rate) : undefined;
          return (
            <TableRow
              key={`${titleId}-${row.tick}`}
              hover
              onClick={pick}
              onKeyDown={
                pick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        pick();
                      }
                    }
                  : undefined
              }
              tabIndex={pick ? 0 : undefined}
              role={pick ? 'button' : undefined}
              aria-label={
                pick
                  ? intl.formatMessage(
                      { id: taker === 'lend' ? 'fixed.book.useRateLend' : 'fixed.book.useRateBorrow' },
                      { rate: formatWadPercent(rate) ?? '' }
                    )
                  : undefined
              }
              sx={pick ? { cursor: 'pointer' } : undefined}
            >
              <TableCell>{row.count}</TableCell>
              <TableCell sx={{ color, fontWeight: 'bold' }}>{formatWadPercent(rate) ?? '-'}</TableCell>
              <TableCell>{Number(formatUnits(row.price, 18)).toFixed(5)}</TableCell>
              <TableCell align="right">{formatTokenDisplay(row.assets, ctx.loan.decimals, undefined, 2)}</TableCell>
              <TableCell align="right">{formatTokenDisplay(row.cumulative, ctx.loan.decimals, undefined, 2)}</TableCell>
            </TableRow>
          );
        })
      )}
    </>
  );

  return (
    <Paper>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, marginBottom: 1 }}>
        <Typography variant="h4" component="h2">
          <FormattedMessage id="fixed.book.title" />
        </Typography>
        {isLoading && <CircularProgress size={16} aria-label={intl.formatMessage({ id: 'fixed.book.loading' })} />}
      </Box>
      {!ctx.isMatured && (
        <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 1 }}>
          <FormattedMessage id="fixed.book.pickHint" />
        </Typography>
      )}

      <TableContainer sx={{ maxHeight: expanded ? 620 : 'none' }}>
        <Table size="small" stickyHeader aria-label={intl.formatMessage({ id: 'fixed.book.title' })}>
          <TableHead>
            <TableRow>
              {columns.map((labelId, index) => (
                <TableCell key={labelId} align={index >= 3 ? 'right' : 'left'}>
                  <FormattedMessage id={labelId} values={{ symbol: ctx.loan.symbol }} />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {renderSide(visibleBids, 'borrow', 'fixed.book.bidsTitle', 'fixed.book.bidsHint', theme.palette.success.main)}

            <TableRow>
              <TableCell colSpan={columns.length} sx={{ paddingTop: 1.5, paddingBottom: 1.5 }}>
                <Tooltip title={intl.formatMessage({ id: 'fixed.book.spreadHint' })} arrow describeChild>
                  <Typography variant="body2" color="text.secondary" component="span">
                    <FormattedMessage id="fixed.book.spread" values={{ value: formatWadPercent(spread) ?? '—' }} />
                  </Typography>
                </Tooltip>
              </TableCell>
            </TableRow>

            {renderSide(visibleAsks, 'lend', 'fixed.book.asksTitle', 'fixed.book.asksHint', theme.palette.error.main)}
          </TableBody>
        </Table>
      </TableContainer>

      {(hiddenLevels > 0 || expanded) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', paddingTop: 1 }}>
          <Button size="small" onClick={() => setExpanded((value) => !value)}>
            <FormattedMessage id={expanded ? 'fixed.book.showLess' : 'fixed.book.showAll'} values={{ count: hiddenLevels }} />
          </Button>
        </Box>
      )}
    </Paper>
  );
}
