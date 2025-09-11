import Box from '@mui/material/Box';
import { Typography, Paper, Tabs, Tab, CircularProgress } from '@mui/material';
import React, { useState, useMemo, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { MarketInterface } from 'types/market';
import { TabPanel, AddTab, BorrowTab, RepayTab, WithdrawTab } from './components';
import { useTheme } from '@mui/material/styles';

interface MarketProps {
  accrualPosition: AccrualPosition | null;
  market?: MarketInterface;
  uniqueKey?: string;
  onPositionUpdate?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

export default function ActionForms(props: MarketProps) {
  const theme = useTheme();
  const uniqueKey = props.uniqueKey;
  const market = props.market;
  const accrualPosition = props.accrualPosition;
  const [tabValue, setTabValue] = useState(0);

  const [txError, setTxError] = useState<string | null>(null);
  // const account = useAccount();
  const { address: userAddress } = useAccount();
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setTxError(null);
  };

  if (!uniqueKey || !market) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" color="error">
          Market not found
        </Typography>
      </Box>
    );
  }

  if (!userAddress) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" color="error">
          Connect wallet to continue.
        </Typography>
      </Box>
    );
  }

  if (!market || !uniqueKey) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ mb: 3, backgroundColor: 'background.default' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="market transaction tabs"
          sx={{
            height: '58px',
            minHeight: '58px',
            borderColor: 'black',
            width: '100%',
            '& .MuiTabs-flexContainer': {
              border: 0,
              height: '100%',
              width: '100%'
            }
          }}
        >
          <Tab label="Add" id="market-tab-0" aria-controls="market-tabpanel-0" sx={{ height: '100%', flex: 1 }} />
          <Tab label="Borrow" id="market-tab-1" aria-controls="market-tabpanel-1" sx={{ height: '100%', flex: 1 }} />
          <Tab label="Repay" id="market-tab-2" aria-controls="market-tabpanel-2" sx={{ height: '100%', flex: 1 }} />
          <Tab label="Withdraw" id="market-tab-3" aria-controls="market-tabpanel-3" sx={{ height: '100%', flex: 1 }} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0} sx={{ bgcolor: theme.palette.background.paper }}>
        <AddTab
          market={market}
          uniqueKey={uniqueKey}
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
      <TabPanel value={tabValue} index={1} sx={{ bgcolor: theme.palette.background.paper }}>
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
      <TabPanel value={tabValue} index={2} sx={{ bgcolor: theme.palette.background.paper }}>
        <RepayTab
          market={market}
          accrualPosition={accrualPosition}
          uniqueKey={uniqueKey}
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
      <TabPanel value={tabValue} index={3} sx={{ bgcolor: theme.palette.background.paper }}>
        <WithdrawTab
          market={market}
          accrualPosition={accrualPosition}
          uniqueKey={uniqueKey}
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
