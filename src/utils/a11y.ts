import { SxProps, Theme } from '@mui/material';

/**
 * Style object for content that must stay in the accessibility tree
 * (screen readers, browser automation, AI agents) but never be painted.
 * Mirrors the well-known "visually hidden" recipe: the node keeps a 1x1
 * clipped box, so it does not affect layout of its siblings.
 */
export const visuallyHidden: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0
};
