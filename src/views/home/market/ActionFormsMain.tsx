import Box from '@mui/material/Box';
import { Typography, Paper, Tabs, Tab, CircularProgress } from '@mui/material';
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { AccrualPosition, Market } from '@morpho-org/blue-sdk';
import { MarketInterface } from 'types/market';
import { TabPanel, AddTab, BorrowTab, RepayTab, WithdrawCollateralTab } from './components';
import { useTheme } from '@mui/material/styles';
import { FormattedMessage, useIntl } from 'react-intl';

interface MarketProps {
  accrualPosition: AccrualPosition | null;
  sdkMarket: Market | null;
  market?: MarketInterface;
  marketId?: string;
  onPositionUpdate?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

export default function ActionFormsMain(props: MarketProps) {
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
    props.onCollateralAmountChange(0n);
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
        <CircularProgress aria-label={intl.formatMessage({ id: 'market.mainActionsLoading' })} />
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
          aria-label={intl.formatMessage({ id: 'market.mainActionsAria' })}
          sx={{
            '& .MuiTab-root': {
              minWidth: 0,
              px: 1.5,
              fontSize: '14px'
            }
          }}
        >
          <Tab
            label={intl.formatMessage({ id: 'market.tabAddCollateral' })}
            id="market-main-tab-0"
            aria-controls="market-main-tabpanel-0"
          />
          <Tab label={intl.formatMessage({ id: 'market.tabBorrow' })} id="market-main-tab-1" aria-controls="market-main-tabpanel-1" />
          <Tab label={intl.formatMessage({ id: 'market.tabRepay' })} id="market-main-tab-2" aria-controls="market-main-tabpanel-2" />
          <Tab
            label={intl.formatMessage({ id: 'market.tabWithdrawCollateral' })}
            id="market-main-tab-3"
            aria-controls="market-main-tabpanel-3"
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0} idPrefix="market-main" sx={{ bgcolor: theme.palette.background.paper }}>
        <AddTab
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
          onCollateralAmountChange={props.onCollateralAmountChange}
        />
      </TabPanel>

      {/* Borrow Tab */}
      <TabPanel value={tabValue} index={1} idPrefix="market-main" sx={{ bgcolor: theme.palette.background.paper }}>
        <BorrowTab
          market={market}
          accrualPosition={accrualPosition}
          onSuccess={() => {
            // Refresh market data or any other necessary updates
            setTxError(null);
            if (props.onPositionUpdate) {
              props.onPositionUpdate();
            }
          }}
          onBorrowAmountChange={props.onBorrowAmountChange}
          onCollateralAmountChange={props.onCollateralAmountChange}
        />
      </TabPanel>

      {/* Repay Tab */}
      <TabPanel value={tabValue} index={2} idPrefix="market-main" sx={{ bgcolor: theme.palette.background.paper }}>
        <RepayTab
          market={market}
          accrualPosition={accrualPosition}
          marketId={marketId}
          sdkMarket={sdkMarket}
          onSuccess={() => {
            // Refresh market data or any other necessary updates
            setTxError(null);
            if (props.onPositionUpdate) {
              props.onPositionUpdate();
            }
          }}
          onBorrowAmountChange={props.onBorrowAmountChange}
          onCollateralAmountChange={props.onCollateralAmountChange}
        />
      </TabPanel>

      {/* Withdraw Tab */}
      <TabPanel value={tabValue} index={3} idPrefix="market-main" sx={{ bgcolor: theme.palette.background.paper }}>
        <WithdrawCollateralTab
          market={market}
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
          onCollateralAmountChange={props.onCollateralAmountChange}
        />
      </TabPanel>
    </Paper>
  );
}
