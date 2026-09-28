import { useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert } from '@mui/material';

import { useTxSteps, type TxStep } from 'hooks/midnight/useTxSteps';
import { redeemRequest } from 'utils/midnightTx';
import FixedAmountInput, { FixedDetailsList, formatTokenDisplay, parseAmountInput } from './FixedAmountInput';
import FixedTxButton from './FixedTxButton';
import type { FixedMarketContext } from './types';

const minBigInt = (...values: bigint[]) => values.reduce((min, value) => (value < min ? value : min));

// ==============================|| FIXED-RATE REDEEM ||============================== //

/** Lender withdrawal of credit after maturity, bounded by the position and the market's withdrawable liquidity. */
export default function FixedRedeemForm({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const tx = useTxSteps(ctx.chainId);
  const { loan, position } = ctx;
  const [unitsInput, setUnitsInput] = useState('');

  const faceValue = position?.faceValue ?? 0n;
  const marketWithdrawable = ctx.sdkMarket?.withdrawable ?? 0n;
  const available = position ? minBigInt(faceValue, position.withdrawable, marketWithdrawable) : 0n;
  const units = parseAmountInput(unitsInput, loan.decimals);
  const validUnits = units ?? 0n;
  const exceeds = validUnits > available;

  const latest = useRef(validUnits);
  latest.current = validUnits;

  const steps = useMemo<TxStep[]>(() => {
    const { user } = ctx;
    if (!user || validUnits === 0n) return [];
    return [
      {
        key: 'redeem',
        label: intl.formatMessage({ id: 'fixed.redeem.button' }),
        build: () =>
          redeemRequest({ chainId: ctx.chainId, marketId: ctx.marketId, marketParams: ctx.marketParams, user, units: latest.current })
      }
    ];
  }, [ctx, validUnits, intl]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FixedAmountInput
        id="fixed-redeem-amount"
        title={intl.formatMessage({ id: 'fixed.manage.tabRedeem' })}
        label={intl.formatMessage({ id: 'fixed.redeem.amountLabel' })}
        symbol={loan.symbol}
        logoURI={loan.logoURI}
        decimals={loan.decimals}
        value={unitsInput}
        onChange={setUnitsInput}
        maxAmount={available}
        ariaLabel={intl.formatMessage({ id: 'fixed.redeem.inputAria' }, { symbol: loan.symbol })}
        describedBy="fixed-redeem-feedback"
        invalid={units === undefined || exceeds}
      />

      <Box id="fixed-redeem-feedback" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {available < faceValue && <Alert severity="info">{intl.formatMessage({ id: 'fixed.redeem.partialHint' })}</Alert>}
        {units === undefined && <Alert severity="error">{intl.formatMessage({ id: 'fixed.form.invalidAmount' })}</Alert>}
        {exceeds && <Alert severity="error">{intl.formatMessage({ id: 'fixed.redeem.exceeds' })}</Alert>}
      </Box>

      <FixedDetailsList
        rows={[
          { label: intl.formatMessage({ id: 'fixed.redeem.credit' }), value: formatTokenDisplay(faceValue, loan.decimals, loan.symbol) },
          {
            label: intl.formatMessage({ id: 'fixed.redeem.marketWithdrawable' }),
            value: formatTokenDisplay(marketWithdrawable, loan.decimals, loan.symbol, 2)
          },
          { label: intl.formatMessage({ id: 'fixed.redeem.available' }), value: formatTokenDisplay(available, loan.decimals, loan.symbol) }
        ]}
      />

      <FixedTxButton
        ctx={ctx}
        tx={tx}
        steps={steps}
        actionLabel={intl.formatMessage({ id: 'fixed.redeem.button' })}
        successMessage={intl.formatMessage({ id: 'fixed.redeem.success' }, { symbol: loan.symbol })}
        disabled={units === undefined || validUnits === 0n || exceeds}
        onSuccess={() => {
          setUnitsInput('');
        }}
      />
    </Box>
  );
}
