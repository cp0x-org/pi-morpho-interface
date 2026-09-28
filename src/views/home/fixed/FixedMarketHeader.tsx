import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { ChainIcon } from 'components/ChainIcon';
import { TokenIcon } from 'components/TokenIcon';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import { shortenAddress } from 'utils/formatters';
import { formatMaturity, formatWadPercent, outstandingLoans, SECONDS_PER_YEAR } from 'utils/midnight';
import { formatTokenDisplay } from './FixedAmountInput';
import type { FixedMarketContext } from './types';

interface FixedMarketHeaderProps {
  ctx: FixedMarketContext;
  /** Compounded rate a taker gets on the best ask. */
  bestLendApy?: bigint;
  /** Compounded rate a taker pays on the best bid. */
  bestBorrowApy?: bigint;
}

// ==============================|| FIXED-RATE MARKET HEADER ||============================== //

export default function FixedMarketHeader({ ctx, bestLendApy, bestBorrowApy }: FixedMarketHeaderProps) {
  const theme = useTheme();
  const intl = useIntl();
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();
  const { loan, collateral, market, sdkMarket, state } = ctx;
  const maturity = formatMaturity(intl, market.maturity, ctx.nowSec);
  // Prefer the on-chain pair: subtracting an API total from an on-chain withdrawable would mix two block heights.
  const outstanding = sdkMarket
    ? outstandingLoans(sdkMarket.totalUnits, sdkMarket.withdrawable)
    : outstandingLoans(state?.totalUnits ?? market.totalUnits);
  const copyTitle = copySuccessMsg || intl.formatMessage({ id: 'common.copyAddress' });

  const stats = [
    { labelId: 'fixed.header.outstanding', value: formatTokenDisplay(outstanding, loan.decimals, loan.symbol, 2) },
    { labelId: 'fixed.header.withdrawable', value: formatTokenDisplay(sdkMarket?.withdrawable, loan.decimals, loan.symbol, 2) },
    { labelId: 'fixed.header.bestLendApy', value: formatWadPercent(bestLendApy) ?? '-' },
    { labelId: 'fixed.header.bestBorrowApy', value: formatWadPercent(bestBorrowApy) ?? '-' },
    { labelId: 'fixed.header.settlementFee', value: formatWadPercent(ctx.settlementFee, 4) ?? '-' },
    {
      labelId: 'fixed.header.continuousFee',
      // continuous fee is a WAD rate per second, capped at 1% a year
      value: sdkMarket ? (formatWadPercent(BigInt(sdkMarket.continuousFee) * SECONDS_PER_YEAR) ?? '-') : '-'
    }
  ];

  const renderCopyButton = (ariaLabel: string, text: string) => (
    <Tooltip title={copyTitle} placement="top">
      <IconButton aria-label={ariaLabel} onClick={() => copyToClipboard(text)} sx={{ padding: '3px' }}>
        <ContentCopyIcon sx={{ fontSize: '16px', color: theme.palette.grey[500] }} />
      </IconButton>
    </Tooltip>
  );

  return (
    <Paper sx={{ padding: '20px 24px', marginBottom: 3 }}>
      <Grid container alignItems="center" spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <TokenIcon
                  symbol={loan.symbol}
                  logoURI={loan.logoURI}
                  sx={{ display: 'flex', zIndex: 2 }}
                  avatarProps={{ alt: '', sx: { width: 38, height: 38 } }}
                />
                <TokenIcon
                  symbol={collateral.symbol}
                  logoURI={collateral.logoURI}
                  sx={{ display: 'flex', marginLeft: '-14px' }}
                  avatarProps={{ alt: '', sx: { width: 38, height: 38 } }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                <Typography variant="h3" component="span">
                  {loan.symbol}
                </Typography>
                {renderCopyButton(
                  intl.formatMessage({ id: 'market.copyLoanAria' }, { symbol: loan.symbol, address: loan.token }),
                  loan.token
                )}
                <Typography variant="h3" component="span" aria-hidden="true" sx={{ mx: 1, color: theme.palette.grey[500] }}>
                  /
                </Typography>
                <Typography variant="h3" component="span">
                  {collateral.symbol}
                </Typography>
                {renderCopyButton(
                  intl.formatMessage({ id: 'market.copyCollateralAria' }, { symbol: collateral.symbol, address: collateral.token }),
                  collateral.token
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <ChainIcon chainId={ctx.chainId} showName />
              <Chip
                size="small"
                color={maturity.isMatured ? 'warning' : 'success'}
                variant="outlined"
                label={intl.formatMessage({ id: maturity.isMatured ? 'fixed.header.statusMatured' : 'fixed.header.statusActive' })}
              />
              <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage id="fixed.header.marketId" values={{ id: shortenAddress(ctx.marketId) }} />
                </Typography>
                {renderCopyButton(intl.formatMessage({ id: 'fixed.header.copyMarketIdAria' }, { id: ctx.marketId }), ctx.marketId)}
              </Box>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage id="fixed.header.maturity" />
              </Typography>
              <Typography variant="h4" component="p">
                {maturity.date}
              </Typography>
              <Typography variant="body2" color={maturity.isMatured ? 'warning.main' : 'text.secondary'}>
                {maturity.relative}
              </Typography>
            </Box>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Grid container spacing={2}>
            {stats.map((stat) => (
              <Grid key={stat.labelId} size={{ xs: 6, sm: 4 }}>
                <Stack spacing={0.5}>
                  <Typography variant="h4" component="p">
                    {stat.value}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.grey[500] }}>
                    <FormattedMessage id={stat.labelId} />
                  </Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Paper>
  );
}
