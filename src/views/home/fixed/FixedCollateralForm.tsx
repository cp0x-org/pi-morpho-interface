import { useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert } from '@mui/material';

import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import { applySafetyFactor, computeLtv, computeMaxDebt, formatWadPercent, maxWithdrawableCollateral } from 'utils/midnight';
import { approveRequest, supplyCollateralRequest, withdrawCollateralRequest } from 'utils/midnightTx';
import FixedAmountInput, { FixedCollateralSelect, FixedDetailsList, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE ADD / WITHDRAW COLLATERAL ||============================== //

export default function FixedCollateralForm({ ctx, mode }: { ctx: FixedMarketContext; mode: 'add' | 'withdraw' }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, collaterals } = ctx;
  const debt = ctx.position?.debt ?? 0n;
  const options = mode === 'withdraw' ? collaterals.filter((collateral) => collateral.positionAmount > 0n) : collaterals;

  const [collateralIndex, setCollateralIndex] = useState(options[0]?.index ?? 0);
  const [amountInput, setAmountInput] = useState('');

  const collateral = collaterals[collateralIndex] ?? options[0];
  const amount = parseAmountInput(amountInput, collateral?.decimals);
  const validAmount = amount ?? 0n;
  const holdings = collaterals.map((item) => ({ amount: item.positionAmount, oraclePrice: item.oraclePrice, lltv: item.lltv }));
  const maxAmount = !collateral
    ? 0n
    : mode === 'add'
      ? (collateral.walletBalance ?? 0n)
      : maxWithdrawableCollateral(holdings, collateral.index, debt);
  const holdingsAfter = holdings.map((holding, index) => {
    if (index !== collateral?.index) return holding;
    const nextAmount = mode === 'add' ? holding.amount + validAmount : holding.amount > validAmount ? holding.amount - validAmount : 0n;
    return { ...holding, amount: nextAmount };
  });
  const exceeds = validAmount > maxAmount;
  // Once matured, unpaid debt is liquidatable whatever the collateral: withdrawals wait for the repayment.
  const blockedAfterMaturity = mode === 'withdraw' && ctx.isMatured && debt > 0n;

  const latest = useRef({ amount: validAmount, collateralIndex: collateral?.index ?? 0 });
  latest.current = { amount: validAmount, collateralIndex: collateral?.index ?? 0 };

  const steps = useMemo<TxStep[]>(() => {
    const { user } = ctx;
    if (!user || !collateral || validAmount === 0n) return [];
    const target = { chainId: ctx.chainId, marketId: ctx.marketId, marketParams: ctx.marketParams, user };
    if (mode === 'withdraw') {
      return [
        {
          key: 'withdraw',
          label: intl.formatMessage({ id: 'fixed.collateral.withdrawButton' }),
          build: () =>
            withdrawCollateralRequest({ ...target, collateralIndex: latest.current.collateralIndex, assets: latest.current.amount })
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
      build: () => supplyCollateralRequest({ ...target, collateralIndex: latest.current.collateralIndex, assets: latest.current.amount })
    });
    return list;
  }, [ctx, collateral, mode, validAmount, intl]);

  if (!collateral) return null;

  const formatLtv = (value?: bigint) => (value == null ? '-' : (formatWadPercent(value) ?? '-'));
  const actionLabel = intl.formatMessage({ id: mode === 'add' ? 'fixed.collateral.addButton' : 'fixed.collateral.withdrawButton' });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FixedCollateralSelect
        id={`fixed-collateral-${mode}-select`}
        label={intl.formatMessage({ id: 'fixed.form.collateralSelect' })}
        options={options}
        value={collateral.index}
        onChange={(index) => {
          setCollateralIndex(index);
          setAmountInput('');
        }}
      />

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
                before: formatTokenDisplay(holdings[collateral.index].amount, collateral.decimals, collateral.symbol),
                after: formatTokenDisplay(holdingsAfter[collateral.index].amount, collateral.decimals, collateral.symbol)
              }
            )
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.ltv' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              { before: formatLtv(computeLtv(debt, holdings)), after: formatLtv(computeLtv(debt, holdingsAfter)) }
            )
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.borrowCapacity' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              {
                before: formatTokenDisplay(applySafetyFactor(computeMaxDebt(holdings)), loan.decimals, loan.symbol, 2),
                after: formatTokenDisplay(applySafetyFactor(computeMaxDebt(holdingsAfter)), loan.decimals, loan.symbol, 2)
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
        onSuccess={() => setAmountInput('')}
      />
    </Box>
  );
}
