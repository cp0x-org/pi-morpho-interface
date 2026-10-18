import { Chip, Tooltip } from '@mui/material';
import React from 'react';
import { useIntl } from 'react-intl';

/** Marks a Morpho Vault V2 row; V1 rows carry no badge. */
export const VaultVersionChip: React.FC = () => {
  const intl = useIntl();
  return (
    <Tooltip title={intl.formatMessage({ id: 'vault.v2BadgeHint' })} arrow>
      <Chip label={intl.formatMessage({ id: 'vault.v2Badge' })} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
    </Tooltip>
  );
};
