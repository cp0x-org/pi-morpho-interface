import Box from '@mui/material/Box';
import { Avatar } from '@mui/material';
import React from 'react';
interface TokenIconProps {
  symbol: string;
}
export const TokenIcon = ({ symbol }: TokenIconProps) => {
  const normalizedSymbol = symbol.toLowerCase();
  const iconUrl = `/tokens/${normalizedSymbol}.svg`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar
        src={iconUrl}
        alt={`${symbol} icon`}
        sx={{ width: 24, height: 24 }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </Box>
  );
};
