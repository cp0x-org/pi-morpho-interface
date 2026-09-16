import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { Paper, Tab, Tabs, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import TabPanel from 'views/home/components/TabPanel';
import FixedCollateralForm from './FixedCollateralForm';
import FixedExitForm from './FixedExitForm';
import FixedRedeemForm from './FixedRedeemForm';
import FixedRepayForm from './FixedRepayForm';
import type { FixedMarketContext } from './types';

type ManageTab = 'repay' | 'addCollateral' | 'withdrawCollateral' | 'redeem' | 'exit';

const TAB_LABELS: Record<ManageTab, string> = {
  repay: 'fixed.manage.tabRepay',
  addCollateral: 'fixed.manage.tabAddCollateral',
  withdrawCollateral: 'fixed.manage.tabWithdrawCollateral',
  redeem: 'fixed.manage.tabRedeem',
  exit: 'fixed.manage.tabExit'
};

// ==============================|| FIXED-RATE POSITION MANAGEMENT ||============================== //

export default function FixedManagePanel({ ctx }: { ctx: FixedMarketContext }) {
  const theme = useTheme();
  const intl = useIntl();
  const [tabIndex, setTabIndex] = useState(0);
  const { position } = ctx;

  if (!ctx.user || !position) return null;

  const faceValue = position.faceValue;
  const debt = position.debt;
  const hasCollateral = ctx.collaterals.some((collateral) => collateral.positionAmount > 0n);
  const tabs = (
    [
      debt > 0n && 'repay',
      !ctx.isMatured && (debt > 0n || hasCollateral) && 'addCollateral',
      hasCollateral && 'withdrawCollateral',
      ctx.isMatured && faceValue > 0n && 'redeem',
      !ctx.isMatured && (faceValue > 0n || debt > 0n) && 'exit'
    ] as (ManageTab | false)[]
  ).filter((tab): tab is ManageTab => !!tab);

  if (tabs.length === 0) return null;
  const activeIndex = Math.min(tabIndex, tabs.length - 1);

  const renderForm = (tab: ManageTab) => {
    switch (tab) {
      case 'repay':
        return <FixedRepayForm ctx={ctx} />;
      case 'addCollateral':
        return <FixedCollateralForm ctx={ctx} mode="add" />;
      case 'withdrawCollateral':
        return <FixedCollateralForm ctx={ctx} mode="withdraw" />;
      case 'redeem':
        return <FixedRedeemForm ctx={ctx} />;
      default:
        return <FixedExitForm ctx={ctx} />;
    }
  };

  return (
    <Paper sx={{ marginBottom: 3, backgroundColor: 'background.default' }}>
      <Typography variant="h4" component="h2" sx={{ padding: '16px 16px 0' }}>
        <FormattedMessage id="fixed.manage.title" />
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeIndex}
          onChange={(event, value: number) => setTabIndex(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label={intl.formatMessage({ id: 'fixed.manage.tabsAria' })}
          sx={{ '& .MuiTab-root': { minWidth: 0, px: 1.5, fontSize: '14px' } }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab}
              label={intl.formatMessage({ id: TAB_LABELS[tab] })}
              id={`fixed-manage-tab-${index}`}
              aria-controls={`fixed-manage-tabpanel-${index}`}
            />
          ))}
        </Tabs>
      </Box>
      {tabs.map((tab, index) => (
        <TabPanel
          key={tab}
          value={activeIndex}
          index={index}
          idPrefix="fixed-manage"
          sx={{ bgcolor: theme.palette.background.paper, padding: 2 }}
        >
          {renderForm(tab)}
        </TabPanel>
      ))}
    </Paper>
  );
}
