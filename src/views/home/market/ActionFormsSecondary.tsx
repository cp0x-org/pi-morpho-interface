import Box from '@mui/material/Box';
import { Typography, Paper, Tabs, Tab, CircularProgress } from '@mui/material';
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { AccrualPosition, Market } from '@morpho-org/blue-sdk';
import { MarketInterface } from 'types/market';
import { TabPanel, WithdrawTab, SupplyTab } from './components';
import { useTheme } from '@mui/material/styles';
import { FormattedMessage, useIntl } from 'react-intl';

interface MarketProps {
  accrualPosition: AccrualPosition | null;
  sdkMarket: Market | null;
  market?: MarketInterface;
  marketId?: string;
  onPositionUpdate?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onLoanAmountChange: (amount: bigint) => void;
}

export default function ActionFormsSecondary(props: MarketProps) {
  const theme = useTheme();
  const intl = useIntl();
  const marketId = props.marketId;
  const accrualPosition = props.accrualPosition;
  const sdkMarket = props.sdkMarket;
  const market = props.market;
  const [tabValue, setTabValue] = useState(0);

  const [txError, setTxError] = useState<string | null>(null);
  // const account = useAccount();
  const { address: userAddress } = useAccount();
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setTxError(null);
    props.onBorrowAmountChange(0n);
    props.onLoanAmountChange(0n);
  };

  if (!marketId || !market) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="alert" color="error">
          <FormattedMessage id="market.notFound" />
        </Typography>
      </Box>
    );
  }

  if (!userAddress) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="status" color="error">
          <FormattedMessage id="market.connectWallet" />
        </Typography>
      </Box>
    );
  }

  if (!market || !marketId) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label={intl.formatMessage({ id: 'market.lendActionsLoading' })} />
      </Box>
    );
  }

  return (
    <Paper sx={{ mb: 3, backgroundColor: 'background.default' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="fullWidth"
          aria-label={intl.formatMessage({ id: 'market.lendActionsAria' })}
          sx={{
            '& .MuiTab-root': {
              minWidth: 0,
              px: 1.5,
              fontSize: '14px'
            }
          }}
        >
          <Tab label={intl.formatMessage({ id: 'market.tabSupply' })} id="market-lend-tab-0" aria-controls="market-lend-tabpanel-0" />
          <Tab label={intl.formatMessage({ id: 'market.tabWithdraw' })} id="market-lend-tab-1" aria-controls="market-lend-tabpanel-1" />
        </Tabs>
      </Box>

      {/* Supply Tab */}
      <TabPanel value={tabValue} index={0} idPrefix="market-lend" sx={{ bgcolor: theme.palette.background.paper }}>
        <SupplyTab
          market={market}
          marketId={marketId}
          onSuccess={() => {
            // Refresh market data or any other necessary updates
            setTxError(null);
            if (props.onPositionUpdate) {
              props.onPositionUpdate();
            }
          }}
          onBorrowAmountChange={props.onBorrowAmountChange}
          onCollateralAmountChange={props.onLoanAmountChange}
        />
      </TabPanel>

      {/* Withdraw Tab */}
      <TabPanel value={tabValue} index={1} idPrefix="market-lend" sx={{ bgcolor: theme.palette.background.paper }}>
        <WithdrawTab
          market={market}
          sdkMarket={sdkMarket}
          accrualPosition={accrualPosition}
          marketId={marketId}
          onSuccess={() => {
            // Refresh market data or any other necessary updates
            setTxError(null);
            if (props.onPositionUpdate) {
              props.onPositionUpdate();
            }
          }}
          onBorrowAmountChange={props.onBorrowAmountChange}
          onLoanAmountChange={props.onLoanAmountChange}
        />
      </TabPanel>
    </Paper>
  );
}
