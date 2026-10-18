import { Chip, Tooltip } from '@mui/material';
import React from 'react';
import { useIntl } from 'react-intl';
import { VaultVersion } from 'types/vaults';

/** Marks which Morpho Vault generation a row is. Rows without a `version` are raw V1 API entities. */
export const VaultVersionChip: React.FC<{ version?: VaultVersion }> = ({ version = 'v1' }) => {
  const intl = useIntl();
  return (
    <Tooltip title={intl.formatMessage({ id: version === 'v2' ? 'vault.v2BadgeHint' : 'vault.v1BadgeHint' })} arrow>
      <Chip
        label={intl.formatMessage({ id: version === 'v2' ? 'vault.v2Badge' : 'vault.v1Badge' })}
        size="small"
        variant="outlined"
        color={version === 'v2' ? 'primary' : 'default'}
        sx={{ height: 20, fontSize: 11 }}
      />
    </Tooltip>
  );
};
