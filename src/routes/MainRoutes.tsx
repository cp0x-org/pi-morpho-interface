import MainLayout from 'layout/MainLayout';
import EarnPage from 'views/home/EarnPage';
import BorrowPage from 'views/home/BorrowPage';
import VaultDetailsPage from 'views/home/VaultDetailsPage';
import MarketDetailPage from 'views/home/MarketDetailPage';
import DashboardPage from 'views/home/DashboardPage';
import FixedMarketsPage from 'views/home/FixedMarketsPage';
import FixedMarketDetailPage from 'views/home/FixedMarketDetailPage';
import LegacyRedirect from './LegacyRedirect';

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: <MainLayout />,
  children: [
    {
      index: true,
      element: <LegacyRedirect to="/portfolio" />
    },
    {
      path: '/portfolio',
      element: <DashboardPage />
    },
    {
      path: '/vaults',
      element: <EarnPage />
    },
    {
      path: '/vault/:vaultAddress/:slug?',
      element: <VaultDetailsPage />
    },
    {
      path: '/variable',
      element: <BorrowPage />
    },
    {
      path: '/variable/:marketId/:slug?',
      element: <MarketDetailPage />
    },
    {
      path: '/fixed',
      element: <FixedMarketsPage />
    },
    {
      path: '/fixed/:marketId/:slug?',
      element: <FixedMarketDetailPage />
    },
    // Legacy URLs: old links keep working, including their ?chainId=
    {
      path: '/dashboard',
      element: <LegacyRedirect to="/portfolio" />
    },
    {
      path: '/earn',
      element: <LegacyRedirect to="/vaults" />
    },
    {
      path: '/earn/vault/:vaultAddress',
      element: <LegacyRedirect to="/vault/:vaultAddress" />
    },
    {
      path: '/borrow',
      element: <LegacyRedirect to="/variable" />
    },
    {
      path: '/borrow/market/:marketId',
      element: <LegacyRedirect to="/variable/:marketId" />
    }
  ]
};

export default MainRoutes;
