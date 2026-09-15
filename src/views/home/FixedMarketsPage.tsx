import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { FormattedMessage } from 'react-intl';

import { visuallyHidden } from 'utils/a11y';

// ==============================|| FIXED RATE MARKETS ||============================== //

export default function FixedMarketsPage() {
  return (
    <Box sx={{ width: '100%' }}>
      <Box component="h1" sx={visuallyHidden}>
        <FormattedMessage id="fixed.list.title" />
      </Box>
      <Typography variant="h3" component="p">
        <FormattedMessage id="fixed.list.subtitle" />
      </Typography>
    </Box>
  );
}
