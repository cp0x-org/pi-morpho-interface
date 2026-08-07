import Box from '@mui/material/Box';
import React from 'react';
import { SxProps, Theme } from '@mui/material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  sx?: SxProps<Theme>;
  /**
   * Namespace for the generated ids. Several independent tab groups live on the
   * same page (market actions, supply/withdraw, vault), so each one needs its
   * own prefix to keep `id` unique and `aria-labelledby` pointing at its own tab.
   */
  idPrefix?: string;
}

export default function TabPanel(props: TabPanelProps) {
  const { children, value, index, sx, idPrefix = 'market', ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`${idPrefix}-tabpanel-${index}`}
      aria-labelledby={`${idPrefix}-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={sx}>{children}</Box>}
    </div>
  );
}
