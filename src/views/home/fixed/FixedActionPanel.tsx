import { useSearchParams } from 'react-router-dom';
import { zeroAddress } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Alert, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

import { getPositionSide } from 'utils/midnight';
import FixedBorrowForm from './FixedBorrowForm';
import FixedBorrowExitForm from './FixedBorrowExitForm';
import FixedLendExitForm from './FixedLendExitForm';
import FixedLendForm from './FixedLendForm';
import FixedLimitExitForm from './FixedLimitExitForm';
import FixedRedeemForm from './FixedRedeemForm';
import FixedRepayForm from './FixedRepayForm';
import type { FixedActionTab, FixedMarketContext } from './types';

const TAB_LABELS: Record<FixedActionTab, string> = {
  lend: 'fixed.list.sideLend',
  borrow: 'fixed.list.sideBorrow',
  repay: 'fixed.manage.tabRepay',
  redeem: 'fixed.manage.tabRedeem',
  exit: 'fixed.actions.tabExit'
};

type FixedOrderType = 'market' | 'limit';

// ==============================|| FIXED-RATE MARKET ORDERS ||============================== //

/**
 * The order form, shaped by the position like on markets.morpho.org: without one you can lend or borrow; with one you
 * can add to it or exit it early, and a borrower can repay. After maturity a borrower can only repay and a lender
 * redeem. Collateral lives on the position card.
 */
export default function FixedActionPanel({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const positionSide = getPositionSide(ctx.position);
  // Repaying at par works either side of maturity, redeeming only after it; trading and exiting early stop at it.
  const tabs: FixedActionTab[] = ctx.isMatured
    ? positionSide === 'borrow'
      ? ['repay']
      : positionSide === 'lend'
        ? ['redeem']
        : []
    : positionSide === 'borrow'
      ? ['borrow', 'repay', 'exit']
      : positionSide === 'lend'
        ? ['lend', 'exit']
        : ['lend', 'borrow'];

  const requested = searchParams.get('side') as FixedActionTab | null;
  // A level clicked on the other side of the book is how a position exits: a borrower buys its debt back from asks,
  // a lender sells credit into bids.
  const pickedExit = tabs.includes('exit') && !!ctx.ratePick && requested === ctx.ratePick.side && requested !== positionSide;
  const tab: FixedActionTab | undefined = requested && tabs.includes(requested) ? requested : pickedExit ? 'exit' : tabs[0];

  // An early exit trades now at the book's price (market) or rests in the book at the user's own price (limit).
  const orderType: FixedOrderType = searchParams.get('orderType') === 'limit' ? 'limit' : 'market';

  const setParam = (key: string, value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(key, value);
    setSearchParams(nextParams, { replace: true });
  };
  const handleTabChange = (nextTab: FixedActionTab) => setParam('side', nextTab);

  return (
    <Paper>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, marginBottom: 2 }}>
        <Typography variant="h4" component="h2">
          <FormattedMessage id="fixed.actions.title" />
        </Typography>
        {tabs.length > 1 && (
          <ToggleButtonGroup
            exclusive
            size="small"
            color="secondary"
            value={tab}
            onChange={(event, value: FixedActionTab | null) => value && handleTabChange(value)}
            aria-label={intl.formatMessage({ id: 'fixed.actions.sideAria' })}
          >
            {tabs.map((item) => (
              <ToggleButton key={item} value={item} sx={{ px: 3 }}>
                <FormattedMessage id={TAB_LABELS[item]} />
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
      </Box>

      {ctx.isMatured && (
        <Alert severity="info" sx={{ marginBottom: tab ? 2 : 0 }}>
          <FormattedMessage id="fixed.actions.matured" />
        </Alert>
      )}
      {(tab === 'lend' || tab === 'borrow') && ctx.market.enterGate !== zeroAddress && (
        <Alert severity="warning" sx={{ marginBottom: 2 }}>
          <FormattedMessage id="fixed.actions.gated" />
        </Alert>
      )}
      {tab === 'lend' && <FixedLendForm ctx={ctx} />}
      {tab === 'borrow' && <FixedBorrowForm ctx={ctx} />}
      {tab === 'repay' && <FixedRepayForm ctx={ctx} />}
      {tab === 'redeem' && <FixedRedeemForm ctx={ctx} />}
      {tab === 'exit' && positionSide && (
        <>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="secondary"
            value={orderType}
            onChange={(event, value: FixedOrderType | null) => value && setParam('orderType', value)}
            aria-label={intl.formatMessage({ id: 'fixed.limit.orderTypeAria' })}
            sx={{ marginBottom: 2 }}
          >
            <ToggleButton value="market">
              <FormattedMessage id="fixed.limit.tabMarket" />
            </ToggleButton>
            <ToggleButton value="limit">
              <FormattedMessage id="fixed.limit.tabLimit" />
            </ToggleButton>
          </ToggleButtonGroup>
          {orderType === 'limit' ? (
            <FixedLimitExitForm key={positionSide} ctx={ctx} side={positionSide} />
          ) : positionSide === 'borrow' ? (
            <FixedBorrowExitForm ctx={ctx} />
          ) : (
            <FixedLendExitForm ctx={ctx} />
          )}
        </>
      )}
    </Paper>
  );
}
