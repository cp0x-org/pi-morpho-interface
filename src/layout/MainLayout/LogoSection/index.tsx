import { Link as RouterLink } from 'react-router-dom';
import { ReactComponent as Cp0xLogo } from '@/assets/images/cp0x-logo.svg';
import { ReactComponent as MorphoLogo } from 'assets/images/morpho/morpho_horizontal.svg';
// material-ui
import Link from '@mui/material/Link';

// project imports
import { DASHBOARD_PATH } from 'config';

// ==============================|| MAIN LOGO ||============================== //

export default function LogoSection() {
  return (
    <Link
      component={RouterLink}
      to={DASHBOARD_PATH}
      aria-label="theme-logo"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        // gap: 1.5,
        textDecoration: 'none'
      }}
    >
      <Cp0xLogo style={{ width: 50, height: 30 }} />
      <MorphoLogo style={{ width: 90, height: 20 }} />
    </Link>
  );
}
