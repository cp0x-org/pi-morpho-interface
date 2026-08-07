import React, { useState, useEffect } from 'react';

// third party
import { IntlProvider } from 'react-intl';
import useConfig from 'hooks/useConfig';

// project imports
import { DEFAULT_LOCALE, loadLocaleMessages, normalizeLocale } from 'i18n';

// ==============================|| LOCALIZATION ||============================== //

interface LocalsProps {
  children: React.ReactNode;
}

export default function Locales({ children }: LocalsProps) {
  const { i18n } = useConfig();
  const locale = normalizeLocale(i18n);
  const [messages, setMessages] = useState<Record<string, string> | undefined>();

  useEffect(() => {
    let active = true;

    loadLocaleMessages(locale).then((loaded) => {
      if (active) setMessages(loaded);
    });

    return () => {
      active = false;
    };
  }, [locale]);

  return (
    <>
      {messages && (
        <IntlProvider locale={locale} defaultLocale={DEFAULT_LOCALE} messages={messages}>
          {children}
        </IntlProvider>
      )}
    </>
  );
}
