import Box, { BoxProps } from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { FormattedMessage, useIntl } from 'react-intl';

// Official static badge from https://brand.morpho.org (dark variant), shipped locally instead of the remote web component.
import { ReactComponent as PoweredByMorphoBadge } from 'assets/images/morpho/powered-by-morpho-dark.svg';

// ==============================|| POWERED BY MORPHO ||============================== //

/** Attribution and risk disclaimer required by Morpho on every screen that interacts with Midnight. */
export default function PoweredByMorpho({ sx }: { sx?: BoxProps['sx'] }) {
  const intl = useIntl();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, marginTop: 4, ...sx }}>
      <Link
        href="https://morpho.org"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={intl.formatMessage({ id: 'fixed.poweredByAria' })}
        sx={{
          display: 'inline-flex',
          padding: '8px 16px',
          borderRadius: '12px',
          // Morpho brand neutral 900: keeps the dark badge legible in both themes
          backgroundColor: '#15181A'
        }}
      >
        <PoweredByMorphoBadge aria-hidden="true" focusable="false" style={{ height: 24, width: 'auto' }} />
      </Link>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 720 }}>
        <FormattedMessage id="fixed.disclaimer" />
      </Typography>
    </Box>
  );
}
