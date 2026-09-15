import Box, { BoxProps } from '@mui/material/Box';
import { Avatar, AvatarProps } from '@mui/material';
import React, { useEffect, useState } from 'react';

interface TokenIconProps extends BoxProps {
  symbol: string;
  /** Remote logo (e.g. Morpho API `logoURI`) used when no local `/tokens/{symbol}.svg` exists. */
  logoURI?: string;
  avatarProps?: AvatarProps; // чтобы можно было кастомизировать Avatar
}

export const TokenIcon: React.FC<TokenIconProps> = ({ symbol, logoURI, avatarProps, ...boxProps }) => {
  const [localIconFailed, setLocalIconFailed] = useState(false);

  useEffect(() => {
    setLocalIconFailed(false);
  }, [symbol]);

  if (!symbol) {
    return null;
  }

  const normalizedSymbol = symbol.toLowerCase();
  const iconUrl = localIconFailed && logoURI ? logoURI : `/tokens/${normalizedSymbol}.svg`;

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
      {...boxProps} // применяем пропсы Box
    >
      <Avatar
        src={iconUrl}
        // The symbol alone is the useful accessible name; `role="img"` already
        // conveys that it is a graphic. Pass `avatarProps={{ alt: '' }}` to mark
        // the icon decorative where the symbol is already spelled out next to it.
        alt={symbol}
        sx={{ width: 36, height: 36, ...avatarProps?.sx }} // объединяем стили
        slotProps={{
          img: {
            onError: () => {
              if (!localIconFailed && logoURI) setLocalIconFailed(true);
            }
          }
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
        {...avatarProps} // применяем остальные пропсы Avatar
      />
    </Box>
  );
};
