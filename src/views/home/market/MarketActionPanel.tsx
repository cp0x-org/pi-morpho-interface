import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { AccrualPosition, Market, MarketParams } from '@morpho-org/blue-sdk';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Paper, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import ConnectButtonCustom from 'components/ConnectButtonCustom';
import { MarketInterface } from 'types/market';
import type { FixedSide } from 'utils/routes';
import { AddTab, BorrowTab, RepayTab, SupplyTab, TabPanel, WithdrawCollateralTab, WithdrawTab } from './components';

interface MarketActionPanelProps {
  accrualPosition: AccrualPosition | null;
  sdkMarket: Market | null;
  marketParams: MarketParams | null;
  chainId?: number;
  market?: MarketInterface;
  marketId?: string;
  /** A transaction from one of the tabs has been confirmed. */
  onPositionUpdate?: () => void;
  /** Re-read the position from the chain. */
  onRefresh?: () => void;
  onBorrowAmountChange: (amount: bigint) => void;
  onCollateralAmountChange: (amount: bigint) => void;
}

type ActionTab = 'addCollateral' | 'borrow' | 'repay' | 'withdrawCollateral' | 'supply' | 'withdraw';

const TABS: Record<FixedSide, { key: ActionTab; labelId: string }[]> = {
  borrow: [
    { key: 'addCollateral', labelId: 'market.tabAddCollateral' },
    { key: 'borrow', labelId: 'market.tabBorrow' },
    { key: 'repay', labelId: 'market.tabRepay' },
    { key: 'withdrawCollateral', labelId: 'market.tabWithdrawCollateral' }
  ],
  lend: [
    { key: 'supply', labelId: 'market.tabSupply' },
    { key: 'withdraw', labelId: 'market.tabWithdraw' }
  ]
};

const noop = () => {};

// ==============================|| VARIABLE-RATE MARKET ACTIONS ||============================== //
//
// One panel for both roles, mirroring the fixed-rate market: a Borrow/Lend switch on top and that role's tabs
// under it. They used to be two unlabelled tab bars stacked on top of each other, which gave no clue that the
// second one belonged to lenders. The side lives in `?side=`, like /fixed, so a view can be linked to.

export default function MarketActionPanel(props: MarketActionPanelProps) {
  const theme = useTheme();
  const intl = useIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const { address: userAddress } = useAccount();
  const [tabIndex, setTabIndex] = useState(0);

  // This page is the borrower's entry point (it used to live at /borrow), so borrowing is the default side.
  const side: FixedSide = searchParams.get('side') === 'lend' ? 'lend' : 'borrow';
  const tabs = TABS[side];
  const activeIndex = Math.min(tabIndex, tabs.length - 1);

  const { market, marketId, chainId, accrualPosition, sdkMarket, marketParams } = props;

  // Every tab reads the same page-level position and none of them fetches it on mount, so a switch is the moment to
  // re-read it: the next tab's limits (max borrow, debt to repay) are exactly what the last action changed.
  const resetPreview = () => {
    props.onBorrowAmountChange(0n);
    props.onCollateralAmountChange(0n);
    props.onRefresh?.();
  };

  const handleSideChange = (nextSide: FixedSide) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('side', nextSide);
    setSearchParams(nextParams, { replace: true });
    setTabIndex(0);
    resetPreview();
  };

  const handleTabChange = (event: React.SyntheticEvent, value: number) => {
    setTabIndex(value);
    resetPreview();
  };

  const onSuccess = () => props.onPositionUpdate?.();

  const renderTab = (tab: ActionTab) => {
    if (!market || !marketId || !chainId) return null;
    const shared = { market, chainId, marketParams, marketId, onSuccess };
    switch (tab) {
      case 'addCollateral':
        return (
          <AddTab {...shared} onBorrowAmountChange={props.onBorrowAmountChange} onCollateralAmountChange={props.onCollateralAmountChange} />
        );
      case 'borrow':
        return (
          <BorrowTab
            {...shared}
            accrualPosition={accrualPosition}
            onBorrowAmountChange={props.onBorrowAmountChange}
            onCollateralAmountChange={props.onCollateralAmountChange}
          />
        );
      case 'repay':
        return (
          <RepayTab
            {...shared}
            accrualPosition={accrualPosition}
            sdkMarket={sdkMarket}
            onBorrowAmountChange={props.onBorrowAmountChange}
            onCollateralAmountChange={props.onCollateralAmountChange}
          />
        );
      case 'withdrawCollateral':
        return (
          <WithdrawCollateralTab
            {...shared}
            accrualPosition={accrualPosition}
            onBorrowAmountChange={props.onBorrowAmountChange}
            onCollateralAmountChange={props.onCollateralAmountChange}
          />
        );
      case 'supply':
        // Supply and Withdraw move the loan token, which the borrow-side position preview does not model.
        return <SupplyTab {...shared} onBorrowAmountChange={noop} onCollateralAmountChange={noop} />;
      default:
        return (
          <WithdrawTab
            {...shared}
            accrualPosition={accrualPosition}
            sdkMarket={sdkMarket}
            onBorrowAmountChange={noop}
            onLoanAmountChange={noop}
          />
        );
    }
  };

  const header = (
    <Box
      sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, padding: '16px 16px 12px' }}
    >
      <Typography variant="h4" component="h2">
        <FormattedMessage id="market.actionsTitle" />
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        color="secondary"
        value={side}
        onChange={(event, value: FixedSide | null) => value && handleSideChange(value)}
        aria-label={intl.formatMessage({ id: 'market.sideAria' })}
      >
        <ToggleButton value="borrow" sx={{ px: 3 }}>
          <FormattedMessage id="fixed.list.sideBorrow" />
        </ToggleButton>
        <ToggleButton value="lend" sx={{ px: 3 }}>
          <FormattedMessage id="fixed.list.sideLend" />
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );

  if (!marketId || !market || !chainId) {
    return (
      <Paper>
        {header}
        <Typography role="alert" color="error" sx={{ padding: 2 }}>
          <FormattedMessage id="market.notFound" />
        </Typography>
      </Paper>
    );
  }

  if (!userAddress) {
    return (
      <Paper>
        {header}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, padding: '8px 16px 24px' }}>
          <Typography role="status" color="text.secondary">
            <FormattedMessage id="market.connectWallet" />
          </Typography>
          <ConnectButtonCustom />
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ backgroundColor: 'background.default' }}>
      {header}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeIndex}
          onChange={handleTabChange}
          variant="fullWidth"
          aria-label={intl.formatMessage({ id: side === 'lend' ? 'market.lendActionsAria' : 'market.mainActionsAria' })}
          sx={{ '& .MuiTab-root': { minWidth: 0, px: 1.5, fontSize: '14px' } }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.key}
              label={intl.formatMessage({ id: tab.labelId })}
              id={`market-action-tab-${index}`}
              aria-controls={`market-action-tabpanel-${index}`}
            />
          ))}
        </Tabs>
      </Box>

      {tabs.map((tab, index) => (
        <TabPanel key={tab.key} value={activeIndex} index={index} idPrefix="market-action" sx={{ bgcolor: theme.palette.background.paper }}>
          {renderTab(tab.key)}
        </TabPanel>
      ))}
    </Paper>
  );
}
