import { formatUnits } from 'viem';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { Card, Divider, Paper, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ArrowRightAlt } from '@mui/icons-material';

import { MarketInterface } from 'types/market';
import { visuallyHidden } from 'utils/a11y';
import { shortenAddress } from 'utils/formatters';

/** Matches both the simulated position and an `AccrualPosition`, whose `ltv` is null while there is no debt. */
interface FuturePosition {
  borrowAssets?: bigint | null;
  collateral?: bigint | null;
  ltv?: bigint | null;
  healthFactor?: bigint | null;
}

interface MarketPositionCardProps {
  market: MarketInterface;
  position: AccrualPosition | null;
  futurePosition?: FuturePosition | null;
  isChanged?: boolean;
  viewedAccount?: string;
}

const formatAmount = (amount: bigint | null | undefined, decimals: number | undefined, symbol?: string) => {
  if (amount == null) return '0';
  const value = amount <= 0n ? 0 : parseFloat(formatUnits(amount, decimals ?? 18));
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}${symbol ? ` ${symbol}` : ''}`;
};

const formatPercent = (value: bigint | null | undefined) =>
  value == null ? '0%' : `${(parseFloat(formatUnits(value, 18)) * 100).toFixed(2)}%`;

// ==============================|| VARIABLE-RATE POSITION ||============================== //
//
// Only what belongs to the user. Market-wide parameters such as the liquidation LTV moved to MarketDetailsCard:
// they never change per user, so mixing them in here made the card read as if LLTV were part of the position.

export default function MarketPositionCard({ market, position, futurePosition, isChanged, viewedAccount }: MarketPositionCardProps) {
  const theme = useTheme();
  const intl = useIntl();

  const cardSx = {
    ...theme.applyStyles('dark', { bgcolor: 'background.default', border: 'none', borderRadius: '12px', padding: '20px' })
  };

  const title = (
    <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '16px' }}>
      {viewedAccount ? (
        <FormattedMessage id="position.viewedTitle" values={{ address: shortenAddress(viewedAccount) }} />
      ) : (
        <FormattedMessage id="common.yourPosition" />
      )}
    </Typography>
  );

  if (!position) {
    return (
      <Paper>
        {title}
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body1" sx={{ color: theme.palette.grey[500] }}>
          <FormattedMessage id="market.noPosition" />
        </Typography>
      </Paper>
    );
  }

  const loanDecimals = market.loanAsset?.decimals;
  const collateralDecimals = market.collateralAsset?.decimals;
  const hasDebt = position.borrowAssets > 0n;

  const cells: { labelId: string; values?: Record<string, string>; value: string; future?: string }[] = [
    {
      labelId: 'market.loanWithSymbol',
      values: { symbol: market.loanAsset?.symbol ?? '' },
      value: formatAmount(position.borrowAssets, loanDecimals),
      future: isChanged && futurePosition ? formatAmount(futurePosition.borrowAssets, loanDecimals) : undefined
    },
    {
      labelId: 'market.collateralWithSymbol',
      values: { symbol: market.collateralAsset?.symbol ?? '' },
      value: formatAmount(position.collateral, collateralDecimals),
      future: isChanged && futurePosition ? formatAmount(futurePosition.collateral, collateralDecimals) : undefined
    }
  ];

  if (position.supplyAssets > 0n) {
    cells.push({
      labelId: 'market.suppliedWithSymbol',
      values: { symbol: market.loanAsset?.symbol ?? '' },
      value: formatAmount(position.supplyAssets, loanDecimals)
    });
  }

  if (hasDebt || position.collateral > 0n) {
    cells.push({
      labelId: 'market.ltv',
      value: formatPercent(position.ltv),
      future: isChanged && futurePosition ? formatPercent(futurePosition.ltv) : undefined
    });
  }

  if (hasDebt && position.healthFactor != null) {
    // Below 1 the position is liquidatable, so the number carries more weight than the raw LTV.
    cells.push({
      labelId: 'market.healthFactor',
      value: parseFloat(formatUnits(position.healthFactor, 18)).toFixed(2),
      future:
        viewedAccount && isChanged && futurePosition
          ? // Max repay can leave residual (or negative) shares after rounding, so anything at or below zero is fully repaid.
            (futurePosition.borrowAssets ?? 0n) <= 0n
            ? '∞'
            : futurePosition.healthFactor != null
              ? parseFloat(formatUnits(futurePosition.healthFactor, 18)).toFixed(2)
              : undefined
          : undefined
    });
  }

  return (
    <Paper>
      {title}
      <Grid container spacing={2}>
        {cells.map((cell) => (
          <Grid key={cell.labelId} size={{ xs: 12, sm: 6 }}>
            <Card sx={cardSx}>
              <Stack spacing={'12px'}>
                <Typography variant="h5" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                  <FormattedMessage id={cell.labelId} values={cell.values} />
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="h4" component="p" sx={{ color: cell.future ? theme.palette.grey[500] : 'inherit' }}>
                    {cell.value}
                  </Typography>
                  {cell.future && (
                    <>
                      <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />
                      <Box component="span" sx={visuallyHidden}>
                        <FormattedMessage id="market.changesTo" />
                      </Box>
                      <Typography variant="h4" component="p">
                        {cell.future}
                      </Typography>
                    </>
                  )}
                </Box>
              </Stack>
            </Card>
          </Grid>
        ))}
      </Grid>
      {hasDebt && position.isLiquidatable && (
        <Typography role="alert" color="error" variant="body2" sx={{ marginTop: 2 }}>
          {intl.formatMessage({ id: 'market.liquidatable' })}
        </Typography>
      )}
    </Paper>
  );
}
