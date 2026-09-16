import { Link as RouterLink } from 'react-router-dom';
import { formatUnits } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { ChainIcon } from 'components/ChainIcon';
import { TokenIcon } from 'components/TokenIcon';
import type { FixedOpenOrder } from 'hooks/midnight/useMidnightOpenOrders';
import type { TokenMetadata } from 'hooks/midnight/useTokensMetadata';
import { visuallyHidden } from 'utils/a11y';
import { shortenAddress } from 'utils/formatters';
import {
  findCollateralIndex,
  formatMaturity,
  formatWadPercent,
  getOrderFilledShare,
  getOrderKind,
  getOrderOfferApy,
  type OrderKind
} from 'utils/midnight';
import { routes } from 'utils/routes';
import FixedCancelOrderButton from './FixedCancelOrderButton';
import { formatTokenDisplay } from './FixedAmountInput';

interface FixedOrdersTableProps {
  orders: FixedOpenOrder[];
  getToken: (chainId: number, address?: string) => TokenMetadata | undefined;
  /** Collateral the user parked in a market for a borrow order (see `isOrderCollateral`), in collateral base units. */
  getOrderCollateral: (chainId: number, marketId: string) => bigint | undefined;
  nowSec: bigint;
  onCancelled: () => void;
}

const KIND_COLORS: Record<OrderKind, 'success' | 'warning' | 'info'> = {
  lend: 'success',
  borrow: 'warning',
  lendExit: 'info',
  borrowExit: 'info'
};

// ==============================|| FIXED-RATE OPEN ORDERS ||============================== //

/**
 * Resting maker orders, kept apart from positions: an order has moved no funds yet and can be cancelled.
 * One row per order; an order quoting several markets lists one line per market in the market-specific cells.
 */
export default function FixedOrdersTable({ orders, getToken, getOrderCollateral, nowSec, onCancelled }: FixedOrdersTableProps) {
  const intl = useIntl();

  /** Time left like markets.morpho.org shows it: "50d 5h", "5h 12m", "12m". */
  const formatRemaining = (timestamp: number) => {
    const seconds = timestamp - Number(nowSec);
    if (seconds <= 0) return intl.formatMessage({ id: 'fixed.orders.expired' });
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    if (days > 0) return intl.formatMessage({ id: 'fixed.orders.remainingDays' }, { days, hours });
    if (hours > 0) return intl.formatMessage({ id: 'fixed.orders.remainingHours' }, { hours, minutes });
    return intl.formatMessage({ id: 'fixed.orders.remainingMinutes' }, { minutes: Math.max(1, minutes) });
  };

  const formatDate = (timestamp: number) =>
    intl.formatDate(timestamp * 1000, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short'
    });

  return (
    <Box sx={{ marginBottom: 2 }}>
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 900 }} aria-label={intl.formatMessage({ id: 'fixed.orders.tableAria' })}>
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="fixed.orders.market" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.orders.network" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.orders.type" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.orders.filled" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.orders.rate" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.orders.collateral" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.orders.expires" />
              </TableCell>
              <TableCell>
                <Box component="span" sx={visuallyHidden}>
                  <FormattedMessage id="fixed.orders.actions" />
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => {
              const loan = getToken(order.chainId, order.loanToken);
              const loanSymbol = loan?.symbol ?? shortenAddress(order.loanToken);
              const filledShare = order.consumed != null ? getOrderFilledShare(order, order.consumed) : undefined;
              // A units cap is a face value in loan-token units, so both caps display in the loan token.
              const filled = order.consumed != null ? formatTokenDisplay(order.consumed, loan?.decimals, undefined, 4) : '-';
              const amount = `${filled} / ${formatTokenDisplay(order.cap, loan?.decimals, loanSymbol, 2)}`;
              const markets = order.offers.map((offer) => {
                const collateralIndex = findCollateralIndex(order.loanToken, offer.collaterals);
                const collateralParams = collateralIndex != null ? offer.collaterals[collateralIndex] : undefined;
                const collateral = collateralParams ? getToken(order.chainId, collateralParams.token) : undefined;
                const collateralSymbol = collateral?.symbol ?? (collateralParams ? shortenAddress(collateralParams.token) : undefined);
                const maturity = formatMaturity(intl, offer.maturity, nowSec);
                return {
                  offer,
                  collateralParams,
                  collateral,
                  collateralSymbol,
                  pair: collateralSymbol ? `${loanSymbol} / ${collateralSymbol}` : loanSymbol,
                  maturity,
                  href: routes.fixedMarket(offer.marketId, loanSymbol, collateralSymbol, offer.maturity),
                  apy: getOrderOfferApy(order.side, offer),
                  parkedCollateral: getOrderCollateral(order.chainId, offer.marketId)
                };
              });

              return (
                <TableRow key={`${order.chainId}:${order.group}`}>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {markets.map((market) => (
                        <Box key={market.offer.marketId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TokenIcon symbol={loanSymbol} logoURI={loan?.logoURI} avatarProps={{ alt: '' }} />
                          <Box>
                            <Link
                              component={RouterLink}
                              to={market.href}
                              color="inherit"
                              underline="hover"
                              aria-label={intl.formatMessage({ id: 'fixed.positions.openAria' }, { pair: market.pair })}
                            >
                              {market.pair}
                            </Link>
                            <Typography variant="body2" color="text.secondary">
                              {market.collateralParams ? (
                                <FormattedMessage
                                  id="fixed.orders.marketDetails"
                                  values={{
                                    maturity: market.maturity.date,
                                    lltv: `${Number(formatUnits(market.collateralParams.lltv, 16))}%`
                                  }}
                                />
                              ) : (
                                market.maturity.date
                              )}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <ChainIcon chainId={order.chainId} showName />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={KIND_COLORS[getOrderKind(order)]}
                      label={intl.formatMessage({ id: `fixed.orders.side.${getOrderKind(order)}` })}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{amount}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage id="fixed.orders.filledShare" values={{ share: formatWadPercent(filledShare) ?? '-' }} />
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {markets.map((market) => (
                      <Typography key={market.offer.marketId} variant="body2">
                        {formatWadPercent(market.apy) ?? '-'}
                      </Typography>
                    ))}
                  </TableCell>
                  <TableCell>
                    {markets.map((market) => (
                      <Typography key={market.offer.marketId} variant="body2">
                        {market.parkedCollateral && market.parkedCollateral > 0n
                          ? formatTokenDisplay(market.parkedCollateral, market.collateral?.decimals, market.collateralSymbol)
                          : '-'}
                      </Typography>
                    ))}
                  </TableCell>
                  <TableCell>
                    {order.series ? (
                      <>
                        <Typography variant="body2">{formatRemaining(order.series.expiry)}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(order.series.expiry)}
                        </Typography>
                      </>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          <FormattedMessage
                            id="fixed.orders.currentOffer"
                            values={{ date: formatDate(Math.max(...order.offers.map((offer) => offer.expiry))) }}
                          />
                        </Typography>
                        {order.series === undefined && (
                          <CircularProgress size={12} aria-label={intl.formatMessage({ id: 'fixed.orders.seriesLoading' })} />
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    <FixedCancelOrderButton order={order} onCancelled={onCancelled} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {orders.some((order) => order.series === null) && (
        <Typography variant="body2" color="text.secondary" sx={{ marginTop: 1 }}>
          <FormattedMessage id="fixed.orders.untracedNote" />
        </Typography>
      )}
    </Box>
  );
}
