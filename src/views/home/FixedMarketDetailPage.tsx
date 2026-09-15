import Box from '@mui/material/Box';
import { FormattedMessage } from 'react-intl';

import { visuallyHidden } from 'utils/a11y';

// ==============================|| FIXED RATE MARKET ||============================== //

export default function FixedMarketDetailPage() {
  return (
    <Box sx={{ padding: '16px 0px' }}>
      <Box component="h1" sx={visuallyHidden}>
        <FormattedMessage id="fixed.market.title" />
      </Box>
    </Box>
  );
}
