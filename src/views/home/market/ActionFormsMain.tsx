import Box from '@mui/material/Box';
import { Typography, Paper, Tabs, Tab, CircularProgress } from '@mui/material';
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { AccrualPosition, Market } from '@morpho-org/blue-sdk';
import { MarketInterface } from 'types/market';
import { TabPanel, AddTab, BorrowTab, RepayTab, WithdrawCollateralTab } from './components';
import { useTheme } from '@mui/material/styles';

interface MarketProps {
  accrualPosition: AccrualPosition | null;
  sdkMarket: Market | null;
  market?: MarketInterface;
  uniqueKey?: string;
  onPositionUpdate?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

export default function ActionFormsMain(props: MarketProps) {
  const theme = useTheme();
  const uniqueKey = props.uniqueKey;
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
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': {
              minWidth: 0,
              px: 1.5,
              fontSize: '14px'
            }
          }}
        >
          <Tab label="Add Collateral" />
          <Tab label="Borrow" />
          <Tab label="Repay" />
          <Tab label="Withdraw Collateral" />
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
      <TabPanel value={tabValue} index={3} sx={{ bgcolor: theme.palette.background.paper }}>
        <WithdrawCollateralTab
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
