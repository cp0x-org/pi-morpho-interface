import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { Alert, Card, Divider, Paper, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { useMidnightPositionPerformance } from 'hooks/midnight/useMidnightUserPositions';
import {
  computeLtv,
  computeMaxDebt,
  formatMaturity,
  formatWadPercent,
  MATURITY_WARNING_SECONDS,
  timeToMaturity,
  WAD
} from 'utils/midnight';
import { formatTokenDisplay } from './FixedAmountInput';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE POSITION ||============================== //

export default function FixedPositionCard({ ctx }: { ctx: FixedMarketContext }) {
  const theme = useTheme();
  const intl = useIntl();
  const { position, loan, collaterals, market } = ctx;
  const performance = useMidnightPositionPerformance(ctx.marketId, ctx.user);

  const cardSx = {
    ...theme.applyStyles('dark', { bgcolor: 'background.default', border: 'none', borderRadius: '12px', padding: '20px' })
  };

  if (!ctx.user || !position) {
    return (
      <Paper>
        <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '16px' }}>
          <FormattedMessage id="common.yourPosition" />
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body1" role="status" sx={{ color: theme.palette.grey[500] }}>
          <FormattedMessage id={ctx.user ? 'fixed.position.loading' : 'market.connectWallet'} />
        </Typography>
      </Paper>
    );
  }

  const faceValue = position.faceValue;
  const hasCollateral = collaterals.some((collateral) => collateral.positionAmount > 0n);
  if (faceValue === 0n && position.debt === 0n && !hasCollateral) {
    return (
      <Paper>
        <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '16px' }}>
          <FormattedMessage id="common.yourPosition" />
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body1" role="status" sx={{ color: theme.palette.grey[500] }}>
          <FormattedMessage id="fixed.position.none" />
        </Typography>
      </Paper>
    );
  }

  const holdings = collaterals.map((collateral) => ({
    amount: collateral.positionAmount,
    oraclePrice: collateral.oraclePrice,
    lltv: collateral.lltv
  }));
  const maxDebt = computeMaxDebt(holdings);
  const ltv = computeLtv(position.debt, holdings);
  const healthFactor = position.debt > 0n && maxDebt > 0n ? (maxDebt * WAD) / position.debt : undefined;
  const maturity = formatMaturity(intl, market.maturity, ctx.nowSec);
  const maxPenalty = collaterals.reduce((max, collateral) => (collateral.maxLif > max ? collateral.maxLif : max), WAD) - WAD;
  const nearMaturity = !ctx.isMatured && timeToMaturity(market.maturity, ctx.nowSec) <= MATURITY_WARNING_SECONDS;
  const typeId =
    position.debt > 0n ? 'fixed.positions.typeBorrow' : faceValue > 0n ? 'fixed.positions.typeLend' : 'fixed.positions.typeCollateralOnly';

  const items = [
    { labelId: 'fixed.positions.type', value: intl.formatMessage({ id: typeId }) },
    faceValue > 0n && { labelId: 'fixed.position.receiveAtMaturity', value: formatTokenDisplay(faceValue, loan.decimals, loan.symbol) },
    position.debt > 0n && {
      labelId: 'fixed.position.repayAtMaturity',
      value: formatTokenDisplay(position.debt, loan.decimals, loan.symbol)
    },
    ...collaterals
      .filter((collateral) => collateral.positionAmount > 0n)
      .map((collateral) => ({
        labelId: 'fixed.position.collateral',
        values: { symbol: collateral.symbol },
        value: formatTokenDisplay(collateral.positionAmount, collateral.decimals, collateral.symbol)
      })),
    position.debt > 0n && { labelId: 'fixed.position.ltv', value: ltv != null ? (formatWadPercent(ltv) ?? '-') : '-' },
    healthFactor != null && { labelId: 'fixed.position.healthFactor', value: (Number(healthFactor) / 1e18).toFixed(2) },
    performance.data && { labelId: 'fixed.position.effectiveApr', value: formatWadPercent(performance.data.effectiveRateWad) ?? '-' },
    performance.data && {
      labelId: 'fixed.position.costBasis',
      value: formatTokenDisplay(performance.data.costBasis / WAD, loan.decimals, loan.symbol)
    }
  ].filter(Boolean) as { labelId: string; value: string; values?: Record<string, string> }[];

  return (
    <Paper>
      <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '24px' }}>
        <FormattedMessage id="common.yourPosition" />
      </Typography>

      {position.debt > 0n && ctx.isMatured && (
        <Alert severity="error" sx={{ marginBottom: 2 }}>
          <FormattedMessage id="fixed.position.overdueWarning" values={{ penalty: formatWadPercent(maxPenalty) }} />
        </Alert>
      )}
      {position.debt > 0n && nearMaturity && (
        <Alert severity="warning" sx={{ marginBottom: 2 }}>
          <FormattedMessage id="fixed.position.maturityWarning" values={{ relative: maturity.relative, date: maturity.date }} />
        </Alert>
      )}
      {faceValue > 0n && ctx.isMatured && (
        <Alert severity="info" sx={{ marginBottom: 2 }}>
          <FormattedMessage id="fixed.position.redeemHint" />
        </Alert>
      )}

      <Grid container spacing={2}>
        {items.map((item, index) => (
          <Grid key={`${item.labelId}-${index}`} size={{ xs: 12, sm: 6 }}>
            <Card sx={cardSx}>
              <Stack spacing={'12px'}>
                <Typography variant="h5" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                  <FormattedMessage id={item.labelId} values={item.values} />
                </Typography>
                <Box>
                  <Typography variant="h4" component="p">
                    {item.value}
                  </Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}
