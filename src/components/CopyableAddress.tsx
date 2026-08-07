import { ContentCopy } from '@mui/icons-material';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useIntl } from 'react-intl';
import { shortenAddress } from 'utils/formatters';

// Component for address with copy functionality
interface CopyableAddressProps {
  address: string;
  symbol?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const CopyableAddress = ({ address, symbol, onClick }: CopyableAddressProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const intl = useIntl();

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click event
    navigator.clipboard
      .writeText(address)
      .then(() => {
        enqueueSnackbar(intl.formatMessage({ id: 'common.addressCopied' }), {
          variant: 'success',
          autoHideDuration: 2000
        });
      })
      .catch((err) => {
        console.error('Failed to copy address:', err);
        enqueueSnackbar(intl.formatMessage({ id: 'common.addressCopyFailed' }), {
          variant: 'error'
        });
      });
  };
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        '&:hover .copy-icon': {
          opacity: 1
        }
      }}
      onClick={onClick}
    >
      <Typography component="span">{symbol ? symbol : shortenAddress(address)}</Typography>
      <Tooltip title={intl.formatMessage({ id: 'common.copyFullAddress' })}>
        <IconButton
          aria-label={
            symbol
              ? intl.formatMessage({ id: 'common.copyTokenAddressAria' }, { symbol, address: shortenAddress(address) })
              : intl.formatMessage({ id: 'common.copyAddressAria' }, { address: shortenAddress(address) })
          }
          onClick={copyToClipboard}
          disableRipple
          sx={{
            ml: 1,
            padding: 0,
            color: 'inherit',
            cursor: 'pointer',
            opacity: 0.3,
            transition: 'opacity 0.2s',
            '&:hover': {
              opacity: 1,
              backgroundColor: 'transparent'
            },
            // the icon is now keyboard reachable, so it needs a focus indicator;
            // it only paints on keyboard focus, which was previously impossible here
            '&.Mui-focusVisible': {
              opacity: 1,
              outline: '2px solid currentColor',
              outlineOffset: '1px'
            }
          }}
          className="copy-icon"
        >
          <ContentCopy fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
