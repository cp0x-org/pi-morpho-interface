import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

// material-ui
import { styled, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AppBar from '@mui/material/AppBar';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';

// project imports
import Footer from './Footer';
import Header from './Header';
import MainContentStyled from './MainContentStyled';
import Loader from 'ui-component/Loader';
import Breadcrumbs from 'ui-component/extended/Breadcrumbs';

import { MenuOrientation, ThemeMode } from 'config';
import useConfig from 'hooks/useConfig';
import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import Tabs from '@mui/material/Tabs';
import Tab, { TabProps } from '@mui/material/Tab';
import MainCard from '../../ui-component/cards/MainCard';

// ==============================|| MAIN LAYOUT ||============================== //

// icon tab style
const AntTabs = styled(Tabs)(({ theme }) => ({
  background: theme.palette.mode === ThemeMode.DARK ? theme.palette.dark[800] : theme.palette.primary.light,
  width: 'fit-content',
  borderBottom: 'none', // убираем бордер
  '& .MuiTabs-flexContainer': {
    border: '1px solid',
    borderRadius: '12px',
    borderColor: '#3F3F3F',
    height: '61px'
  },
  '& .MuiTabs-scroller': {
    borderBottom: 'none'
  },
  borderRadius: '12px',
  boxShadow: 'none',
  '& .MuiTabs-indicator': {
    backgroundColor: theme.palette.secondary.main,
    height: 0 // скрываем индикатор активного таба
  }
}));

// style constant
const AntTab = styled((props: TabProps) => <Tab disableRipple {...props} />)(({ theme }) => ({
  textTransform: 'none',
  minWidth: 0,
  fontWeight: theme.typography.fontWeightRegular,
  fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  // fontWeight: 500, // Medium
  fontSize: '18px',
  color: theme.palette.grey[100],
  '&.MuiTab-root': {
    borderRight: '1px solid #3F3F3F',
    borderColor: '#3F3F3F',
    minWidth: '125px'
  },
  '&:hover': {
    color: theme.palette.grey[500],
    opacity: 1
  },
  '&.Mui-selected': {
    color: theme.palette.background.default,
    backgroundColor: theme.palette.secondary.main,
    fontWeight: theme.typography.fontWeightMedium
  },
  '&.Mui-focusVisible': {
    backgroundColor: theme.palette.secondary.main
  }
}));
export default function MainLayout() {
  const theme = useTheme();
  const downMD = useMediaQuery(theme.breakpoints.down('md'));

  const { borderRadius, container, miniDrawer, menuOrientation } = useConfig();
  const { menuMaster, menuMasterLoading } = useGetMenuMaster();
  const drawerOpen = menuMaster?.isDashboardDrawerOpened;

  const tabs = [
    { label: 'Dashboard', path: 'dashboard', iconPosition: 'top' },
    { label: 'Earn', path: 'earn', iconPosition: 'top' },
    { label: 'Borrow', path: 'borrow', iconPosition: 'top' }
  ];

  const navigate = useNavigate();
  const location = useLocation();
  const currentTabIndex = tabs.findIndex((tab) => location.pathname.includes(tab.path));

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    navigate(`/${tabs[newValue].path}`);
  };

  useEffect(() => {
    handlerDrawerOpen(!miniDrawer);
  }, [miniDrawer]);

  useEffect(() => {
    downMD && handlerDrawerOpen(false);
  }, [downMD]);

  const isHorizontal = menuOrientation === MenuOrientation.HORIZONTAL && !downMD;

  if (menuMasterLoading) return <Loader />;

  return (
    <Box sx={{ display: 'flex' }}>
      {/* header */}
      <AppBar enableColorOnDark position="fixed" color="inherit" elevation={0} sx={{ bgcolor: 'background.default' }}>
        <Toolbar sx={{ p: isHorizontal ? 1.25 : 2 }}>
          <Header />
        </Toolbar>
      </AppBar>

      {/* main content */}
      <MainContentStyled {...{ borderRadius, menuOrientation, open: drawerOpen, marginTop: 80 }}>
        <Container
          maxWidth={'lg'}
          sx={{
            ...(!container && { px: { xs: 0 } }),
            minHeight: 'calc(100vh - 228px)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* breadcrumb */}
          <Breadcrumbs />
          {/*<Outlet />*/}

          {/*<MainCard>*/}
          <MainCard>
            <AntTabs value={currentTabIndex} onChange={handleChange} centered>
              {tabs.map((tab) => (
                <AntTab wrapped={true} key={tab.path} label={tab.label} />
              ))}
            </AntTabs>
            <Box sx={{ pt: 3 }}>
              <Outlet />
            </Box>
          </MainCard>
          {/*</MainCard>*/}
        </Container>
        {/* footer */}
        <Footer />
      </MainContentStyled>
    </Box>
  );
}
