import { useState } from 'react';
import { Link as RouterLink, type To } from 'react-router-dom';
import { Alert, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import type { Address } from 'viem';
import type useViewedAccount from 'hooks/useViewedAccount';
import { shortenAddress } from 'utils/formatters';
import { parseAccountAddress } from 'utils/viewedAccount';
import { useIntl } from 'react-intl';

export function AccountLookup({
  rawAccount,
  requestedAccount,
  invalidAccount,
  connected,
  setAccount
}: ReturnType<typeof useViewedAccount>) {
  const intl = useIntl();
  const [input, setInput] = useState(requestedAccount ?? rawAccount ?? '');
  const [invalid, setInvalid] = useState(invalidAccount);

  return (
    <Stack
      component="form"
      direction="row"
      useFlexGap
      flexWrap="wrap"
      alignItems="flex-start"
      spacing={1}
      sx={{ mb: 2 }}
      onSubmit={(event) => {
        event.preventDefault();
        const account = parseAccountAddress(input);
        setInvalid(!account);
        if (account) {
          setInput(account);
          setAccount(account);
        }
      }}
    >
      <TextField
        label={intl.formatMessage({ id: 'portfolio.viewAddress' })}
        value={input}
        onChange={(event) => {
          setInput(event.target.value);
          setInvalid(false);
        }}
        error={invalid}
        helperText={invalid && intl.formatMessage({ id: 'portfolio.invalidAddress' })}
        autoComplete="off"
        size="small"
        sx={{ flex: { xs: '1 0 100%', sm: '1 1 22rem' }, maxWidth: 520, minWidth: 0 }}
      />
      <Button type="submit" variant="contained" color="secondary" disabled={!input.trim()}>
        {intl.formatMessage({ id: 'portfolio.viewAccount' })}
      </Button>
      {connected && (
        <Button
          type="button"
          color="secondary"
          onClick={() => {
            setInput('');
            setInvalid(false);
            setAccount(null);
          }}
        >
          {intl.formatMessage({ id: 'portfolio.myWallet' })}
        </Button>
      )}
    </Stack>
  );
}

export function ViewedPositionBanner({ account, connected, ownHref }: { account: Address; connected?: Address; ownHref: To }) {
  const intl = useIntl();
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography fontWeight={600}>{intl.formatMessage({ id: 'position.viewedLabel' })}</Typography>
        <Chip
          size="small"
          component={RouterLink}
          to={ownHref}
          clickable
          title={account}
          label={shortenAddress(account)}
          aria-label={intl.formatMessage({ id: 'position.returnToWallet' }, { address: account })}
        />
      </Stack>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {connected
          ? intl.formatMessage({ id: 'position.walletPays' }, { wallet: shortenAddress(connected) })
          : intl.formatMessage({ id: 'position.connectToPay' })}
      </Typography>
    </Alert>
  );
}
