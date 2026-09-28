import { Fragment, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Button, InputAdornment, TextField, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { CustomInput } from 'components/CustomInput';
import { TokenIcon } from 'components/TokenIcon';
import { formatAssetOutput, normalizePointAmount } from 'utils/formatters';

/** Form text ("1,5" or "1.5") → base units. `0n` for an empty field, undefined when invalid or decimals are unknown. */
export const parseAmountInput = (value: string, decimals?: number): bigint | undefined => {
  if (decimals == null) return undefined;
  if (!value) return 0n;
  try {
    return parseUnits(normalizePointAmount(value), decimals);
  } catch {
    return undefined;
  }
};

export const formatTokenInput = (amount: bigint, decimals: number) => formatAssetOutput(formatUnits(amount, decimals));

/** Display only. */
export const formatTokenDisplay = (amount: bigint | undefined, decimals?: number, symbol?: string, maximumFractionDigits = 6) =>
  amount == null || decimals == null
    ? '-'
    : `${Number(formatUnits(amount, decimals)).toLocaleString('en-US', { maximumFractionDigits })}${symbol ? ` ${symbol}` : ''}`;

const PERCENTS = [25, 50, 75, 100];

interface FixedAmountInputProps {
  id: string;
  title: string;
  label: string;
  symbol: string;
  logoURI?: string;
  decimals?: number;
  value: string;
  onChange: (value: string) => void;
  /** Base for the 25/50/75/Max buttons. */
  maxAmount?: bigint;
  /** Which of those buttons is on (100 for Max), null once the field is typed in: Max can mean "all of it" to a form. */
  onPercentChange?: (percent: number | null) => void;
  /** Line under the buttons, e.g. the wallet balance. */
  hint?: string;
  ariaLabel: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}

// ==============================|| FIXED-RATE AMOUNT INPUT ||============================== //

export default function FixedAmountInput({
  id,
  title,
  label,
  symbol,
  logoURI,
  decimals,
  value,
  onChange,
  maxAmount,
  onPercentChange,
  hint,
  ariaLabel,
  describedBy,
  invalid,
  disabled
}: FixedAmountInputProps) {
  const theme = useTheme();
  const intl = useIntl();
  const [activePercent, setActivePercent] = useState<number | null>(null);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: '20px',
        bgcolor: theme.palette.background.default,
        borderRadius: '12px'
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="body2" fontWeight="bold">
            {title}
          </Typography>
          <Typography variant="body2">{label}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TokenIcon symbol={symbol} logoURI={logoURI} avatarProps={{ alt: '', sx: { width: 32, height: 32 } }} />
          <Typography fontWeight="bold">{symbol}</Typography>
        </Box>
      </Box>
      <CustomInput
        type="text"
        fullWidth
        value={value}
        onChange={(event) => {
          onChange(formatAssetOutput(event.target.value));
          setActivePercent(null);
          onPercentChange?.(null);
        }}
        disabled={disabled}
        placeholder="0"
        inputProps={{
          inputMode: 'decimal',
          pattern: '[0-9]*,?[0-9]*',
          id,
          'aria-label': ariaLabel,
          'aria-describedby': describedBy,
          'aria-invalid': invalid || undefined
        }}
      />
      {maxAmount != null && decimals != null && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {PERCENTS.map((percent) => (
            <Button
              key={percent}
              variant="outlined"
              size="small"
              disabled={disabled || maxAmount === 0n}
              aria-pressed={activePercent === percent}
              aria-label={intl.formatMessage(
                { id: percent === 100 ? 'fixed.form.maxAria' : 'fixed.form.percentAria' },
                { percent, symbol }
              )}
              onClick={() => {
                onChange(formatTokenInput((maxAmount * BigInt(percent)) / 100n, decimals));
                setActivePercent(percent);
                onPercentChange?.(percent);
              }}
              sx={{
                flex: 1,
                bgcolor: activePercent === percent ? theme.palette.secondary.main : 'transparent',
                color: activePercent === percent ? theme.palette.background.paper : 'inherit'
              }}
            >
              {percent === 100 ? <FormattedMessage id="common.max" /> : `${percent}%`}
            </Button>
          ))}
        </Box>
      )}
      {hint && (
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

interface FixedRateInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  invalid?: boolean;
  disabled?: boolean;
}

/** Key/value summary under a form (estimated APR, limits, LTV before → after…). */
export function FixedDetailsList({ rows }: { rows: { label: string; value: string }[] }) {
  const theme = useTheme();
  return (
    <Box
      component="dl"
      sx={{
        margin: 0,
        padding: '16px 20px',
        border: '1px solid',
        borderColor: theme.palette.grey[800],
        borderRadius: '12px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        rowGap: 1,
        columnGap: 2
      }}
    >
      {rows.map((row) => (
        <Fragment key={row.label}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {row.label}
          </Typography>
          <Typography component="dd" variant="body2" fontWeight="bold" sx={{ margin: 0, textAlign: 'right' }}>
            {row.value}
          </Typography>
        </Fragment>
      ))}
    </Box>
  );
}

/** Rate limit field in percent (APR). */
export function FixedRateInput({ id, label, value, onChange, helperText, invalid, disabled }: FixedRateInputProps) {
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/[^0-9.,]/g, ''))}
      helperText={helperText}
      error={invalid}
      disabled={disabled}
      size="small"
      fullWidth
      slotProps={{
        input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
        htmlInput: { inputMode: 'decimal' }
      }}
    />
  );
}
