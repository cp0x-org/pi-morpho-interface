import { Avatar, AvatarProps, Tooltip } from '@mui/material';
import Box, { BoxProps } from '@mui/material/Box';
import React from 'react';
import { getChainName } from 'utils/chains';

interface ChainIconProps extends BoxProps {
  chainId: number;
  showName?: boolean;
  avatarProps?: AvatarProps;
}

export const ChainIcon: React.FC<ChainIconProps> = ({ chainId, showName = false, avatarProps, ...boxProps }) => {
  if (!chainId) return null;

  const name = getChainName(chainId);
  const iconUrl = `/chains/${chainId}.jpg`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} {...boxProps}>
      <Tooltip title={name} arrow>
        <Avatar
          src={iconUrl}
          alt={name}
          sx={{ width: 24, height: 24, ...avatarProps?.sx }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
          {...avatarProps}
        />
      </Tooltip>
      {showName && name}
    </Box>
  );
};
