import { useState, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { Alert, Button, Card, Dialog, DialogContent, DialogTitle, Divider, IconButton, Paper, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';

import { useMidnightPositionPerformance } from 'hooks/midnight/useMidnightUserPositions';
import {
  computeLtv,
  computeMaxDebt,
  formatMaturity,
  formatWadPercent,
  getOrderKind,
  getPositionSide,
  MATURITY_WARNING_SECONDS,
  timeToMaturity,
  WAD
} from 'utils/midnight';
import { formatTokenDisplay } from './FixedAmountInput';
import FixedCollateralForm from './FixedCollateralForm';
import type { FixedMarketContext } from './types';

type PositionDialog = 'supplyCollateral' | 'withdrawCollateral';

const DIALOG_TITLES: Record<PositionDialog, string> = {
  supplyCollateral: 'fixed.manage.tabAddCollateral',
  withdrawCollateral: 'fixed.manage.tabWithdrawCollateral'
};

interface PositionItem {
  labelId: string;
  value: string;
  values?: Record<string, string>;
  actions?: ReactNode;
}

// ==============================|| FIXED-RATE POSITION ||============================== //

/**
 * The position and what you can do with it, like on markets.morpho.org: Borrow / Lend, Repay, Redeem and Exit switch the
 * order form, collateral opens its form in a dialog.
 */
export default function FixedPositionCard({ ctx }: { ctx: FixedMarketContext }) {
  const theme = useTheme();
  const intl = useIntl();
  const { position, loan, collateral, market } = ctx;
  const performance = useMidnightPositionPerformance(ctx.marketId, ctx.user);
  const [dialog, setDialog] = useState<PositionDialog | null>(null);

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
  // Collateral parked for an open borrow order is not a position yet: the orders card shows it with the order.
  const onlyOrderCollateral = faceValue === 0n && position.debt === 0n && ctx.openOrders.some((order) => getOrderKind(order) === 'borrow');
  if (onlyOrderCollateral || (faceValue === 0n && position.debt === 0n && collateral.positionAmount === 0n)) {
    return (
      <Paper>
        <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '16px' }}>
          <FormattedMessage id="common.yourPosition" />
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body1" role="status" sx={{ color: theme.palette.grey[500] }}>
          {onlyOrderCollateral && collateral.positionAmount > 0n ? (
            <FormattedMessage
              id="fixed.position.orderCollateral"
              values={{ amount: formatTokenDisplay(collateral.positionAmount, collateral.decimals, collateral.symbol) }}
            />
          ) : (
            <FormattedMessage id="fixed.position.none" />
          )}
        </Typography>
      </Paper>
    );
  }

  const holding = { amount: collateral.positionAmount, oraclePrice: collateral.oraclePrice, lltv: collateral.lltv };
  const maxDebt = computeMaxDebt(holding);
  const ltv = computeLtv(position.debt, holding);
  const healthFactor = position.debt > 0n && maxDebt > 0n ? (maxDebt * WAD) / position.debt : undefined;
  const maturity = formatMaturity(intl, market.maturity, ctx.nowSec);
  const maxPenalty = collateral.maxLif - WAD;
  const nearMaturity = !ctx.isMatured && timeToMaturity(market.maturity, ctx.nowSec) <= MATURITY_WARNING_SECONDS;
  const positionSide = getPositionSide(position);
  const typeId =
    position.debt > 0n ? 'fixed.positions.typeBorrow' : faceValue > 0n ? 'fixed.positions.typeLend' : 'fixed.positions.typeCollateralOnly';

  const items = [
    { labelId: 'fixed.positions.type', value: intl.formatMessage({ id: typeId }) },
    faceValue > 0n && { labelId: 'fixed.position.receiveAtMaturity', value: formatTokenDisplay(faceValue, loan.decimals, loan.symbol) },
    position.debt > 0n && {
      labelId: 'fixed.position.repayAtMaturity',
      value: formatTokenDisplay(position.debt, loan.decimals, loan.symbol)
    },
    (collateral.positionAmount > 0n || positionSide === 'borrow') && {
      labelId: 'fixed.position.collateral',
      values: { symbol: collateral.symbol },
      value: formatTokenDisplay(collateral.positionAmount, collateral.decimals, collateral.symbol),
      actions: (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!ctx.isMatured && (
            <Button
              size="small"
              variant="outlined"
              aria-label={intl.formatMessage({ id: 'fixed.position.supplyAria' }, { symbol: collateral.symbol })}
              onClick={() => setDialog('supplyCollateral')}
            >
              <FormattedMessage id="fixed.position.actionSupply" />
            </Button>
          )}
          {collateral.positionAmount > 0n && (
            <Button
              size="small"
              variant="outlined"
              aria-label={intl.formatMessage({ id: 'fixed.position.withdrawAria' }, { symbol: collateral.symbol })}
              onClick={() => setDialog('withdrawCollateral')}
            >
              <FormattedMessage id="fixed.position.actionWithdraw" />
            </Button>
          )}
        </Box>
      )
    },
    position.debt > 0n && { labelId: 'fixed.position.ltv', value: ltv != null ? (formatWadPercent(ltv) ?? '-') : '-' },
    healthFactor != null && { labelId: 'fixed.position.healthFactor', value: (Number(healthFactor) / 1e18).toFixed(2) },
    performance.data && { labelId: 'fixed.position.effectiveApr', value: formatWadPercent(performance.data.effectiveRateWad) ?? '-' },
    performance.data && {
      labelId: 'fixed.position.costBasis',
      value: formatTokenDisplay(performance.data.costBasis / WAD, loan.decimals, loan.symbol)
    }
  ].filter(Boolean) as PositionItem[];

  // Exiting early and adding to the position only exist before maturity; repaying and redeeming work either side of it.
  const actions = (
    [
      positionSide === 'borrow' && { key: 'repay', labelId: 'fixed.position.actionRepay', onClick: () => ctx.openAction('repay') },
      positionSide === 'lend' &&
        ctx.isMatured && { key: 'redeem', labelId: 'fixed.position.actionRedeem', onClick: () => ctx.openAction('redeem') },
      positionSide && !ctx.isMatured && { key: 'exit', labelId: 'fixed.position.actionExit', onClick: () => ctx.openAction('exit') },
      positionSide &&
        !ctx.isMatured && {
          key: positionSide,
          labelId: positionSide === 'borrow' ? 'fixed.position.actionBorrow' : 'fixed.position.actionLend',
          onClick: () => ctx.openAction(positionSide),
          primary: true
        }
    ] as ({ key: string; labelId: string; onClick: () => void; primary?: boolean } | false | null)[]
  ).filter((action): action is { key: string; labelId: string; onClick: () => void; primary?: boolean } => !!action);

  const closeDialog = () => setDialog(null);

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
                {item.actions}
              </Stack>
            </Card>
          </Grid>
        ))}
      </Grid>

      {actions.length > 0 && (
        <Box
          role="group"
          aria-label={intl.formatMessage({ id: 'fixed.position.actionsAria' })}
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', marginTop: 2 }}
        >
          {actions.map((action) => (
            <Button
              key={action.key}
              variant={action.primary ? 'contained' : 'outlined'}
              onClick={action.onClick}
              sx={{ flex: '1 1 0', minWidth: 96 }}
            >
              <FormattedMessage id={action.labelId} />
            </Button>
          ))}
        </Box>
      )}

      <Dialog open={!!dialog} onClose={closeDialog} fullWidth maxWidth="sm" aria-labelledby="fixed-position-dialog-title">
        {dialog && (
          <>
            <DialogTitle id="fixed-position-dialog-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <FormattedMessage id={DIALOG_TITLES[dialog]} />
              <IconButton aria-label={intl.formatMessage({ id: 'fixed.position.dialogClose' })} onClick={closeDialog} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ paddingTop: 1 }}>
                <FixedCollateralForm ctx={ctx} mode={dialog === 'supplyCollateral' ? 'add' : 'withdraw'} onDone={closeDialog} />
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Paper>
  );
}
