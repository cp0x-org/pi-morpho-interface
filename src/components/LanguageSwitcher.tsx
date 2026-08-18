import { useState } from 'react';

// material-ui
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';

// third party
import { FormattedMessage, useIntl } from 'react-intl';

// project imports
import useConfig from 'hooks/useConfig';
import { normalizeLocale, SUPPORTED_LOCALES } from 'i18n';

// types
import { I18n } from 'types/config';

interface LanguageSwitcherProps {
  fullWidth?: boolean;
}

// ==============================|| LANGUAGE SWITCHER ||============================== //

export default function LanguageSwitcher({ fullWidth = false }: LanguageSwitcherProps) {
  const intl = useIntl();
  const { i18n, onChangeLocale } = useConfig();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const activeLocale = normalizeLocale(i18n);
  const activeIndex = Math.max(
    SUPPORTED_LOCALES.findIndex((locale) => locale.value === activeLocale),
    0
  );
  // The button advertises the language you can switch *to*, not the active one.
  const nextLocale = SUPPORTED_LOCALES[(activeIndex + 1) % SUPPORTED_LOCALES.length];

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (locale: I18n) => {
    onChangeLocale(locale);
    setAnchorEl(null);
  };

  return (
    <>
      <Button
        color="inherit"
        onClick={handleOpen}
        fullWidth={fullWidth}
        aria-label={intl.formatMessage({ id: 'language.label' })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'language-switcher-menu' : undefined}
        sx={{ textTransform: 'none', fontWeight: 500, justifyContent: fullWidth ? 'flex-start' : 'center' }}
      >
        {nextLocale.shortLabel}
      </Button>

      <Menu
        id="language-switcher-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <MenuItem key={locale.value} selected={locale.value === activeLocale} onClick={() => handleSelect(locale.value)}>
            <ListItemText primary={<FormattedMessage id={locale.labelId} />} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
