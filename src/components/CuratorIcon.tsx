import React, { useState } from 'react';
import Box from '@mui/material/Box';
import { Avatar } from '@mui/material';
interface TokenIconProps {
  symbol: string;
}
export const CuratorIcon = ({ symbol }: TokenIconProps) => {
  const normalizedSymbol = symbol.toLowerCase();
  const [iconUrl, setIconUrl] = useState(`/curators/${normalizedSymbol}.svg`);
  const [triedPng, setTriedPng] = useState(false);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!triedPng) {
      // попробуем png, если svg не загрузился
      setIconUrl(`/curators/${normalizedSymbol}.png`);
      setTriedPng(true);
    } else {
      // если и png не загрузился — скрыть
      (e.target as HTMLImageElement).style.display = 'none';
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar src={iconUrl} alt={`${symbol} icon`} sx={{ width: 24, height: 24 }} onError={handleError} />
    </Box>
  );
};
