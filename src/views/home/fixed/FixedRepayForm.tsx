import { useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, Checkbox, FormControlLabel } from '@mui/material';

import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import { computeLtv, formatWadPercent, getDeadline, maxWithdrawableCollateral } from 'utils/midnight';
import { approveRequest, authorizeBundlesRequest, repayRequest } from 'utils/midnightTx';
import FixedAmountInput, { FixedCollateralSelect, FixedDetailsList, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE REPAY AT PAR ||============================== //

export default function FixedRepayForm({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, collaterals } = ctx;
  const debt = ctx.position?.debt ?? 0n;
  const withCollateral = collaterals.filter((collateral) => collateral.positionAmount > 0n);

  const [repayInput, setRepayInput] = useState('');
  const [withdrawEnabled, setWithdrawEnabled] = useState(false);
  const [collateralIndex, setCollateralIndex] = useState(withCollateral[0]?.index ?? 0);
  const [withdrawInput, setWithdrawInput] = useState('');

  const repayAssets = parseAmountInput(repayInput, loan.decimals);
  const validRepay = repayAssets ?? 0n;
  const walletBalance = loan.walletBalance ?? 0n;
  const maxRepay = debt < walletBalance ? debt : walletBalance;
  const debtAfter = debt > validRepay ? debt - validRepay : 0n;

  const collateral = collaterals[collateralIndex] ?? collaterals[0];
  const holdings = collaterals.map((item) => ({ amount: item.positionAmount, oraclePrice: item.oraclePrice, lltv: item.lltv }));
  const maxWithdraw = collateral ? maxWithdrawableCollateral(holdings, collateral.index, debtAfter) : 0n;
  const withdrawAssets = withdrawEnabled ? parseAmountInput(withdrawInput, collateral?.decimals) : 0n;
  const validWithdraw = withdrawAssets ?? 0n;
  const holdingsAfter = holdings.map((holding, index) =>
    index === collateral?.index ? { ...holding, amount: holding.amount > validWithdraw ? holding.amount - validWithdraw : 0n } : holding
  );

  const exceedsDebt = validRepay > debt;
  const exceedsWallet = validRepay > walletBalance;
  const exceedsWithdrawable = validWithdraw > maxWithdraw;

  const latest = useRef({ repay: validRepay, withdraw: validWithdraw, collateralIndex: collateral?.index ?? 0 });
  latest.current = { repay: validRepay, withdraw: validWithdraw, collateralIndex: collateral?.index ?? 0 };

  const steps = useMemo<TxStep[]>(() => {
    const { user, midnightBundles } = ctx;
    if (!user || !midnightBundles || validRepay === 0n) return [];
    const list: TxStep[] = [];
    if ((loan.allowanceBundles ?? 0n) < validRepay) {
      list.push({
        key: 'approve',
        label: intl.formatMessage({ id: 'fixed.tx.approve' }, { symbol: loan.symbol }),
        build: () => approveRequest(ctx.chainId, loan.token, midnightBundles, latest.current.repay)
      });
    }
    if (!ctx.isBundlesAuthorized) {
      list.push({
        key: 'authorize',
        label: intl.formatMessage({ id: 'fixed.tx.authorize' }),
        build: () => authorizeBundlesRequest(ctx.chainId, user)
      });
    }
    list.push({
      key: 'repay',
      label: intl.formatMessage({ id: 'fixed.repay.button' }),
      build: () =>
        repayRequest({
          chainId: ctx.chainId,
          marketId: ctx.marketId,
          marketParams: ctx.marketParams,
          user,
          repayAssets: latest.current.repay,
          withdrawals: [{ collateralIndex: latest.current.collateralIndex, assets: latest.current.withdraw }],
          deadline: getDeadline()
        })
    });
    return list;
  }, [ctx, loan.allowanceBundles, loan.symbol, loan.token, validRepay, intl]);

  const formatLtv = (value?: bigint) => (value == null ? '-' : (formatWadPercent(value) ?? '-'));
  const disabled =
    repayAssets === undefined ||
    validRepay === 0n ||
    exceedsDebt ||
    exceedsWallet ||
    (withdrawEnabled && (withdrawAssets === undefined || exceedsWithdrawable));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FixedAmountInput
        id="fixed-repay-amount"
        title={intl.formatMessage({ id: 'fixed.manage.tabRepay' })}
        label={intl.formatMessage({ id: 'fixed.repay.amountLabel' })}
        symbol={loan.symbol}
        logoURI={loan.logoURI}
        decimals={loan.decimals}
        value={repayInput}
        onChange={setRepayInput}
        maxAmount={maxRepay}
        hint={intl.formatMessage(
          { id: 'fixed.form.wallet' },
          { amount: formatTokenDisplay(loan.walletBalance, loan.decimals, loan.symbol) }
        )}
        ariaLabel={intl.formatMessage({ id: 'fixed.repay.inputAria' }, { symbol: loan.symbol })}
        describedBy="fixed-repay-feedback"
        invalid={repayAssets === undefined || exceedsDebt || exceedsWallet}
      />

      {withCollateral.length > 0 && (
        <FormControlLabel
          control={<Checkbox checked={withdrawEnabled} onChange={(event) => setWithdrawEnabled(event.target.checked)} />}
          label={intl.formatMessage({ id: 'fixed.repay.withdrawToggle' })}
        />
      )}

      {withdrawEnabled && collateral && (
        <>
          <FixedCollateralSelect
            id="fixed-repay-collateral"
            label={intl.formatMessage({ id: 'fixed.form.collateralSelect' })}
            options={withCollateral}
            value={collateral.index}
            onChange={(index) => {
              setCollateralIndex(index);
              setWithdrawInput('');
            }}
          />
          <FixedAmountInput
            id="fixed-repay-withdraw-amount"
            title={intl.formatMessage({ id: 'fixed.manage.tabWithdrawCollateral' })}
            label={intl.formatMessage({ id: 'fixed.repay.withdrawLabel' })}
            symbol={collateral.symbol}
            logoURI={collateral.logoURI}
            decimals={collateral.decimals}
            value={withdrawInput}
            onChange={setWithdrawInput}
            maxAmount={maxWithdraw}
            hint={intl.formatMessage(
              { id: 'fixed.collateral.maxWithdrawable' },
              { amount: formatTokenDisplay(maxWithdraw, collateral.decimals, collateral.symbol) }
            )}
            ariaLabel={intl.formatMessage({ id: 'fixed.collateral.withdrawInputAria' }, { symbol: collateral.symbol })}
            describedBy="fixed-repay-feedback"
            invalid={withdrawAssets === undefined || exceedsWithdrawable}
          />
        </>
      )}

      <Box id="fixed-repay-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {(repayAssets === undefined || withdrawAssets === undefined) && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>
        )}
        {exceedsDebt && <Alert severity="error">{intl.formatMessage({ id: 'fixed.repay.exceedsDebt' })}</Alert>}
        {exceedsWallet && (
          <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.exceedsBalance' }, { symbol: loan.symbol })}</Alert>
        )}
        {withdrawEnabled && exceedsWithdrawable && <Alert severity="error">{intl.formatMessage({ id: 'fixed.collateral.exceeds' })}</Alert>}
      </Box>

      <FixedDetailsList
        rows={[
          {
            label: intl.formatMessage({ id: 'fixed.position.repayAtMaturity' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              {
                before: formatTokenDisplay(debt, loan.decimals, loan.symbol),
                after: formatTokenDisplay(debtAfter, loan.decimals, loan.symbol)
              }
            )
          },
          {
            label: intl.formatMessage({ id: 'fixed.form.ltv' }),
            value: intl.formatMessage(
              { id: 'fixed.form.beforeAfter' },
              { before: formatLtv(computeLtv(debt, holdings)), after: formatLtv(computeLtv(debtAfter, holdingsAfter)) }
            )
          }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={intl.formatMessage({ id: 'fixed.repay.button' })}
        successMessage={intl.formatMessage({ id: 'fixed.repay.success' }, { symbol: loan.symbol })}
        disabled={disabled}
        onSuccess={() => {
          setRepayInput('');
          setWithdrawInput('');
        }}
      />
    </Box>
  );
}
