import Box, { BoxProps } from '@mui/material/Box';
import { Avatar, AvatarProps } from '@mui/material';
import React from 'react';

interface TokenIconProps extends BoxProps {
  symbol: string;
  avatarProps?: AvatarProps; // чтобы можно было кастомизировать Avatar
}

export const TokenIcon: React.FC<TokenIconProps> = ({ symbol, avatarProps, ...boxProps }) => {
  if (!symbol) {
    return null;
  }

  const normalizedSymbol = symbol.toLowerCase();
  const iconUrl = `/tokens/${normalizedSymbol}.svg`;

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
      {...boxProps} // применяем пропсы Box
    >
      <Avatar
        src={iconUrl}
        alt={`${symbol} icon`}
        sx={{ width: 36, height: 36, ...avatarProps?.sx }} // объединяем стили
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
        {...avatarProps} // применяем остальные пропсы Avatar
      />
    </Box>
  );
};
