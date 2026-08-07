import { useState } from 'react';

// material-ui
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import TranslateIcon from '@mui/icons-material/Translate';

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
  const currentLocale = SUPPORTED_LOCALES.find((locale) => locale.value === activeLocale) ?? SUPPORTED_LOCALES[0];

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
        startIcon={<TranslateIcon aria-hidden="true" />}
        fullWidth={fullWidth}
        aria-label={intl.formatMessage({ id: 'language.label' })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'language-switcher-menu' : undefined}
        sx={{ textTransform: 'none', fontWeight: 500, justifyContent: fullWidth ? 'flex-start' : 'center' }}
      >
        {currentLocale.shortLabel}
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
