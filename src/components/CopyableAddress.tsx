import { ContentCopy } from '@mui/icons-material';
import { Box, Tooltip, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { shortenAddress } from 'utils/formatters';

// Component for address with copy functionality
interface CopyableAddressProps {
  address: string;
  symbol?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const CopyableAddress = ({ address, symbol, onClick }: CopyableAddressProps) => {
  const { enqueueSnackbar } = useSnackbar();

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click event
    navigator.clipboard
      .writeText(address)
      .then(() => {
        enqueueSnackbar('Address copied to clipboard!', {
          variant: 'success',
          autoHideDuration: 2000
        });
      })
      .catch((err) => {
        console.error('Failed to copy address:', err);
        enqueueSnackbar('Failed to copy address', {
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
      <Tooltip title="Copy full address">
        <ContentCopy
          fontSize="small"
          onClick={copyToClipboard}
          sx={{
            ml: 1,
            cursor: 'pointer',
            opacity: 0.3,
            transition: 'opacity 0.2s',
            '&:hover': {
              opacity: 1
            }
          }}
          className="copy-icon"
        />
      </Tooltip>
    </Box>
  );
};
