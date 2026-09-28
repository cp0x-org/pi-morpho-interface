import { useState } from 'react';
import { isAddressEqual, type Address } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import {
  Button,
  CircularProgress,
  Link,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography
} from '@mui/material';

import { useExplorerUrl } from 'hooks/midnight/useExplorerUrl';
import { useMidnightTransactions } from 'hooks/midnight/useMidnightTransactions';
import type { MidnightTransaction } from 'types/midnight';
import { shortenAddress } from 'utils/formatters';
import TabPanel from 'views/home/components/TabPanel';
import { formatTokenDisplay } from './FixedAmountInput';
import type { FixedMarketContext } from './types';

const EVENT_LABELS: Record<string, string> = {
  lend: 'fixed.activity.eventLend',
  exit_lend_primary: 'fixed.activity.eventExitLendPrimary',
  exit_lend_secondary: 'fixed.activity.eventExitLendSecondary',
  borrow: 'fixed.activity.eventBorrow',
  exit_borrow_primary: 'fixed.activity.eventExitBorrowPrimary',
  exit_borrow_secondary: 'fixed.activity.eventExitBorrowSecondary',
  supply_collateral: 'fixed.activity.eventSupplyCollateral',
  withdraw_collateral: 'fixed.activity.eventWithdrawCollateral',
  partial_liquidation: 'fixed.activity.eventPartialLiquidation',
  full_liquidation: 'fixed.activity.eventFullLiquidation'
};

const INITIAL_ROWS = 10;
const MORE_ROWS = 20;

const toBigInt = (value: unknown) => {
  try {
    return value == null ? undefined : BigInt(String(value));
  } catch {
    return undefined;
  }
};

// ==============================|| FIXED-RATE MARKET ACTIVITY ||============================== //

export default function FixedMarketActivity({ ctx }: { ctx: FixedMarketContext }) {
  const intl = useIntl();
  const explorer = useExplorerUrl(ctx.chainId);
  const [tab, setTab] = useState(ctx.user ? 0 : 1);
  // The API returns up to 50 events; showing them all turned the page into a mile of table.
  const [visibleCount, setVisibleCount] = useState(INITIAL_ROWS);

  const userTransactions = useMidnightTransactions({ scope: 'user', user: ctx.user, marketId: ctx.marketId, enabled: tab === 0 });
  const marketTransactions = useMidnightTransactions({ scope: 'market', marketId: ctx.marketId, enabled: tab === 1 });

  const formatAmount = (transaction: MidnightTransaction) => {
    const { data } = transaction;
    const collateralToken = typeof data.collateral === 'string' ? (data.collateral as Address) : undefined;
    if (collateralToken) {
      // Other apps can post the loan token as collateral too: the market feed shows those events as well.
      const token = [ctx.collateral, ctx.loan].find((item) => isAddressEqual(item.token, collateralToken));
      return formatTokenDisplay(toBigInt(data.assets), token?.decimals, token?.symbol ?? shortenAddress(collateralToken));
    }
    return formatTokenDisplay(toBigInt(data.assets ?? data.units), ctx.loan.decimals, ctx.loan.symbol);
  };

  const renderTable = (query: ReturnType<typeof useMidnightTransactions>, labelId: string) => {
    if (query.isLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
          <CircularProgress aria-label={intl.formatMessage({ id: 'fixed.activity.loading' })} />
        </Box>
      );
    }
    if (query.error) {
      return (
        <Typography role="alert" color="error" sx={{ padding: 2 }}>
          <FormattedMessage id="fixed.activity.error" values={{ message: query.error.message }} />
        </Typography>
      );
    }
    if (query.transactions.length === 0) {
      return (
        <Typography role="status" color="text.secondary" sx={{ padding: 2 }}>
          <FormattedMessage id="fixed.activity.empty" />
        </Typography>
      );
    }
    const rows = query.transactions.slice(0, visibleCount);
    const hidden = query.transactions.length - rows.length;
    return (
      <TableContainer>
        <Table size="small" sx={{ minWidth: 560 }} aria-label={intl.formatMessage({ id: labelId })}>
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="fixed.activity.event" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.activity.amount" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.activity.time" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="fixed.activity.tx" />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((transaction) => {
              const txLink = explorer.tx(transaction.txHash);
              return (
                <TableRow key={transaction.id}>
                  <TableCell>
                    {EVENT_LABELS[transaction.eventType]
                      ? intl.formatMessage({ id: EVENT_LABELS[transaction.eventType] })
                      : transaction.eventType}
                  </TableCell>
                  <TableCell>{formatAmount(transaction)}</TableCell>
                  <TableCell>{intl.formatDate(transaction.createdAt * 1000, { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                  <TableCell>
                    {txLink ? (
                      <Link
                        href={txLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={intl.formatMessage({ id: 'fixed.activity.txAria' }, { hash: shortenAddress(transaction.txHash) })}
                      >
                        {shortenAddress(transaction.txHash)}
                      </Link>
                    ) : (
                      shortenAddress(transaction.txHash)
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {hidden > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', padding: 1.5 }}>
            <Button size="small" onClick={() => setVisibleCount((count) => count + MORE_ROWS)}>
              <FormattedMessage id="fixed.activity.showMore" values={{ count: hidden }} />
            </Button>
          </Box>
        )}
      </TableContainer>
    );
  };

  return (
    <Paper>
      <Typography variant="h4" component="h2" gutterBottom>
        <FormattedMessage id="fixed.activity.title" />
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(event, value: number) => {
            setTab(value);
            setVisibleCount(INITIAL_ROWS);
          }}
          aria-label={intl.formatMessage({ id: 'fixed.activity.tabsAria' })}
        >
          <Tab
            label={intl.formatMessage({ id: 'fixed.activity.tabMine' })}
            id="fixed-activity-tab-0"
            aria-controls="fixed-activity-tabpanel-0"
          />
          <Tab
            label={intl.formatMessage({ id: 'fixed.activity.tabMarket' })}
            id="fixed-activity-tab-1"
            aria-controls="fixed-activity-tabpanel-1"
          />
        </Tabs>
      </Box>
      <TabPanel value={tab} index={0} idPrefix="fixed-activity">
        {ctx.user ? (
          renderTable(userTransactions, 'fixed.activity.tabMine')
        ) : (
          <Typography role="status" color="text.secondary" sx={{ padding: 2 }}>
            <FormattedMessage id="market.connectWallet" />
          </Typography>
        )}
      </TabPanel>
      <TabPanel value={tab} index={1} idPrefix="fixed-activity">
        {renderTable(marketTransactions, 'fixed.activity.tabMarket')}
      </TabPanel>
    </Paper>
  );
}
