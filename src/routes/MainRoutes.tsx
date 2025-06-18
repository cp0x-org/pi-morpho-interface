import MainLayout from 'layout/MainLayout';
import { Navigate } from 'react-router';
import EarnPage from 'views/home/EarnPage';
import BorrowPage from 'views/home/BorrowPage';
import VaultDetailsPage from 'views/home/VaultDetailsPage';
import MarketDetailPage from 'views/home/MarketDetailPage';

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: <MainLayout />,
  children: [
    {
      index: true,
      element: <Navigate to="earn" replace />
    },
    {
      path: '/earn',
      element: <EarnPage />
    },
    {
      path: '/earn/vault/:address',
      element: <VaultDetailsPage />
    },
    {
      path: '/borrow',
      element: <BorrowPage />
    },
    {
      path: '/borrow/market/:uniqueKey',
      element: <MarketDetailPage />
    }
  ]
};

export default MainRoutes;
