import { useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert } from '@mui/material';

import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import { computeLtv, computeSafeMaxDebt, formatWadPercent, getOpenBorrowUnits, maxWithdrawableCollateral } from 'utils/midnight';
import { approveRequest, supplyCollateralRequest, withdrawCollateralRequest } from 'utils/midnightTx';
import FixedAmountInput, { FixedDetailsList, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE ADD / WITHDRAW COLLATERAL ||============================== //

/** `onDone` runs after a successful transaction, e.g. to close the dialog the form sits in. */
export default function FixedCollateralForm({
  ctx,
  mode,
  onDone
}: {
  ctx: FixedMarketContext;
  mode: 'add' | 'withdraw';
  onDone?: () => void;
}) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, collateral } = ctx;
  const debt = ctx.position?.debt ?? 0n;
  // What open borrow orders can still add here: the collateral they rely on stays put, as on markets.morpho.org.
  const orderDebt = getOpenBorrowUnits(ctx.openOrders, ctx.marketId);

  const [amountInput, setAmountInput] = useState('');

  const amount = parseAmountInput(amountInput, collateral.decimals);
  const validAmount = amount ?? 0n;
  const holding = { amount: collateral.positionAmount, oraclePrice: collateral.oraclePrice, lltv: collateral.lltv };
  const maxAmount = mode === 'add' ? (collateral.walletBalance ?? 0n) : maxWithdrawableCollateral(holding, debt + orderDebt);
  const holdingAfter = {
    ...holding,
    amount: mode === 'add' ? holding.amount + validAmount : holding.amount > validAmount ? holding.amount - validAmount : 0n
  };
  const exceeds = validAmount > maxAmount;
  // Once matured, unpaid debt is liquidatable whatever the collateral: withdrawals wait for the repayment.
  const blockedAfterMaturity = mode === 'withdraw' && ctx.isMatured && debt > 0n;

  const latest = useRef({ amount: validAmount });
  latest.current = { amount: validAmount };

  const steps = useMemo<TxStep[]>(() => {
    const { user } = ctx;
    if (!user || validAmount === 0n) return [];
    const target = { chainId: ctx.chainId, marketId: ctx.marketId, marketParams: ctx.marketParams, user };
    if (mode === 'withdraw') {
      return [
        {
          key: 'withdraw',
          label: intl.formatMessage({ id: 'fixed.collateral.withdrawButton' }),
          build: () => withdrawCollateralRequest({ ...target, collateralIndex: collateral.index, assets: latest.current.amount })
        }
      ];
    }
    const list: TxStep[] = [];
    if ((collateral.allowanceMidnight ?? 0n) < validAmount) {
      list.push({
        key: 'approve',
        label: intl.formatMessage({ id: 'fixed.tx.approve' }, { symbol: collateral.symbol }),
        build: () => approveRequest(ctx.chainId, collateral.token, ctx.marketParams.midnight, latest.current.amount)
      });
    }
    list.push({
      key: 'add',
      label: intl.formatMessage({ id: 'fixed.collateral.addButton' }),
      build: () => supplyCollateralRequest({ ...target, collateralIndex: collateral.index, assets: latest.current.amount })
    });
    return list;
  }, [ctx, collateral, mode, validAmount, intl]);

  const formatLtv = (value?: bigint) => (value == null ? '-' : (formatWadPercent(value) ?? '-'));
  const actionLabel = intl.formatMessage({ id: mode === 'add' ? 'fixed.collateral.addButton' : 'fixed.collateral.withdrawButton' });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FixedAmountInput
        id={`fixed-collateral-${mode}-amount`}
        title={actionLabel}
        label={intl.formatMessage({ id: 'fixed.collateral.amountLabel' })}
        symbol={collateral.symbol}
        logoURI={collateral.logoURI}
        decimals={collateral.decimals}
        value={amountInput}
        onChange={setAmountInput}
        maxAmount={maxAmount}
        hint={
          mode === 'add'
            ? intl.formatMessage(
                { id: 'fixed.form.wallet' },
                { amount: formatTokenDisplay(collateral.walletBalance, collateral.decimals, collateral.symbol) }
              )
            : intl.formatMessage(
                { id: 'fixed.collateral.maxWithdrawable' },
                { amount: formatTokenDisplay(maxAmount, collateral.decimals, collateral.symbol) }
              )
        }
        ariaLabel={intl.formatMessage(
          { id: mode === 'add' ? 'fixed.collateral.addInputAria' : 'fixed.collateral.withdrawInputAria' },
          { symbol: collateral.symbol }
        )}
        describedBy={`fixed-collateral-${mode}-feedback`}
        invalid={amount === undefined || exceeds}
        disabled={blockedAfterMaturity}
      />

      <Box id={`fixed-collateral-${mode}-feedback`} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {blockedAfterMaturity && <Alert severity="warning">{intl.formatMessage({ id: 'fixed.collateral.blockedAfterMaturity' })}</Alert>}
        {mode === 'withdraw' && orderDebt > 0n && (
          <Alert severity="info">{intl.formatMessage({ id: 'fixed.collateral.backsOrder' })}</Alert>
        )}
        {amount === undefined && <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>}
        {exceeds && <Alert severity="error">{intl.formatMessage({ id: 'fixed.collateral.exceeds' })}</Alert>}
      </Box>

      <FixedDetailsList
        rows={[
          {
            label: intl.formatMessage({ id: 'fixed.position.collateral' }, { symbol: collateral.symbol }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              {
                before: formatTokenDisplay(holding.amount, collateral.decimals, collateral.symbol),
                after: formatTokenDisplay(holdingAfter.amount, collateral.decimals, collateral.symbol)
              }
            )
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.ltv' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              { before: formatLtv(computeLtv(debt, holding)), after: formatLtv(computeLtv(debt, holdingAfter)) }
            )
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.borrowCapacity' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              {
                before: formatTokenDisplay(computeSafeMaxDebt(holding), loan.decimals, loan.symbol, 2),
                after: formatTokenDisplay(computeSafeMaxDebt(holdingAfter), loan.decimals, loan.symbol, 2)
              }
            )
          }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={actionLabel}
        successMessage={intl.formatMessage(
          { id: mode === 'add' ? 'fixed.collateral.addSuccess' : 'fixed.collateral.withdrawSuccess' },
          { symbol: collateral.symbol }
        )}
        disabled={amount === undefined || validAmount === 0n || exceeds || blockedAfterMaturity}
        onSuccess={() => {
          setAmountInput('');
          onDone?.();
        }}
      />
    </Box>
  );
}
