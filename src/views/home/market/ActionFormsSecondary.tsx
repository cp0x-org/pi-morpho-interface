import Box from '@mui/material/Box';
import { Typography, Paper, Tabs, Tab, CircularProgress } from '@mui/material';
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { AccrualPosition, Market } from '@morpho-org/blue-sdk';
import { MarketInterface } from 'types/market';
import { TabPanel, WithdrawTab, SupplyTab } from './components';
import { useTheme } from '@mui/material/styles';

interface MarketProps {
  accrualPosition: AccrualPosition | null;
  sdkMarket: Market | null;
  market?: MarketInterface;
  uniqueKey?: string;
  onPositionUpdate?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onLoanAmountChange: (amount: bigint) => void;
}

export default function ActionFormsSecondary(props: MarketProps) {
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
    props.onLoanAmountChange(0n);
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
          <Tab label="Supply" />
          <Tab label="Withdraw" />
        </Tabs>
      </Box>

      {/* Supply Tab */}
      <TabPanel value={tabValue} index={0} sx={{ bgcolor: theme.palette.background.paper }}>
        <SupplyTab
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
          onCollateralAmountChange={props.onLoanAmountChange}
        />
      </TabPanel>

      {/* Withdraw Tab */}
      <TabPanel value={tabValue} index={1} sx={{ bgcolor: theme.palette.background.paper }}>
        <WithdrawTab
          market={market}
          sdkMarket={sdkMarket}
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
          onLoanAmountChange={props.onLoanAmountChange}
        />
      </TabPanel>
    </Paper>
  );
}
