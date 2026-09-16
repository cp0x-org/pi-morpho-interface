import { useSearchParams } from 'react-router-dom';
import { zeroAddress } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

import type { FixedSide } from 'utils/routes';
import FixedBorrowForm from './FixedBorrowForm';
import FixedLendForm from './FixedLendForm';
import type { FixedMarketContext } from './types';

// ==============================|| FIXED-RATE MARKET ORDERS ||============================== //

export default function FixedActionPanel({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const side: FixedSide = searchParams.get('side') === 'borrow' ? 'borrow' : 'lend';

  const handleSideChange = (nextSide: FixedSide) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('side', nextSide);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <Paper sx={{ marginBottom: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, marginBottom: 2 }}>
        <Typography variant="h4" component="h2">
          <FormattedMessage id="fixed.actions.title" />
        </Typography>
        {!ctx.isMatured && (
          <ToggleButtonGroup
            exclusive
            size="small"
            color="secondary"
            value={side}
            onChange={(event, value: FixedSide | null) => value && handleSideChange(value)}
            aria-label={intl.formatMessage({ id: 'fixed.actions.sideAria' })}
          >
            <ToggleButton value="lend" sx={{ px: 3 }}>
              <FormattedMessage id="fixed.list.sideLend" />
            </ToggleButton>
            <ToggleButton value="borrow" sx={{ px: 3 }}>
              <FormattedMessage id="fixed.list.sideBorrow" />
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      {ctx.isMatured ? (
        <Alert severity="info">
          <FormattedMessage id="fixed.actions.matured" />
        </Alert>
      ) : (
        <>
          {ctx.market.enterGate !== zeroAddress && (
            <Alert severity="warning" sx={{ marginBottom: 2 }}>
              <FormattedMessage id="fixed.actions.gated" />
            </Alert>
          )}
          {side === 'lend' ? <FixedLendForm ctx={ctx} /> : <FixedBorrowForm ctx={ctx} />}
        </>
      )}
    </Paper>
  );
}
