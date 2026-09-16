import { formatUnits } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { formatWadPercent, priceToApr, takerPrice } from 'utils/midnight';
import { formatTokenDisplay } from './FixedAmountInput';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE ORDER BOOK ||============================== //

export default function FixedOrderBook({ ctx, isLoading }: { ctx: FixedMarketContext; isLoading: boolean }) {
  const intl = useIntl();
  const sides = [
    { key: 'asks', taker: 'lend' as const, levels: ctx.book?.asks ?? [], titleId: 'fixed.book.asksTitle', hintId: 'fixed.book.asksHint' },
    { key: 'bids', taker: 'borrow' as const, levels: ctx.book?.bids ?? [], titleId: 'fixed.book.bidsTitle', hintId: 'fixed.book.bidsHint' }
  ];

  return (
    <Paper sx={{ marginBottom: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, marginBottom: 2 }}>
        <Typography variant="h4" component="h2">
          <FormattedMessage id="fixed.book.title" />
        </Typography>
        {isLoading && <CircularProgress size={16} aria-label={intl.formatMessage({ id: 'fixed.book.loading' })} />}
      </Box>
      <Grid container spacing={3}>
        {sides.map((side) => (
          <Grid key={side.key} size={{ xs: 12, lg: 6 }}>
            <Typography variant="h5" component="h3">
              <FormattedMessage id={side.titleId} />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 1 }}>
              <FormattedMessage id={side.hintId} />
            </Typography>
            <TableContainer>
              <Table size="small" aria-label={intl.formatMessage({ id: side.titleId })}>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <FormattedMessage id="fixed.book.rate" />
                    </TableCell>
                    <TableCell>
                      <FormattedMessage id="fixed.book.price" />
                    </TableCell>
                    <TableCell align="right">
                      <FormattedMessage id="fixed.book.amount" />
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {side.levels.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" color="text.secondary">
                          <FormattedMessage id="fixed.book.empty" />
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    side.levels.map((level) => (
                      <TableRow key={level.tick}>
                        <TableCell>
                          {formatWadPercent(
                            priceToApr(takerPrice(side.taker, level.price, ctx.settlementFee), ctx.market.maturity, ctx.nowSec)
                          ) ?? '-'}
                        </TableCell>
                        <TableCell>{Number(formatUnits(level.price, 18)).toFixed(7)}</TableCell>
                        <TableCell align="right">{formatTokenDisplay(level.assets, ctx.loan.decimals, ctx.loan.symbol, 2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}
