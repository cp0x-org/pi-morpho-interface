import Box from '@mui/material/Box';
import React from 'react';
import { SxProps, Theme } from '@mui/material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  sx?: SxProps<Theme>;
}

export default function TabPanel(props: TabPanelProps) {
  const { children, value, index, sx, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} id={`market-tabpanel-${index}`} aria-labelledby={`market-tab-${index}`} {...other}>
      {value === index && <Box sx={sx}>{children}</Box>}
    </div>
  );
}
