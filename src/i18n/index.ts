// types
import { I18n } from 'types/config';

// ==============================|| I18N - LOCALES ||============================== //

export const SUPPORTED_LOCALES: { value: I18n; labelId: string; shortLabel: string }[] = [
  { value: 'en', labelId: 'language.en', shortLabel: 'EN' },
  { value: 'zh', labelId: 'language.zh', shortLabel: '中文' }
];

export const DEFAULT_LOCALE: I18n = 'en';

type NestedMessages = { [key: string]: string | NestedMessages };

/**
 * Locale files are authored as nested JSON for readability, while react-intl
 * expects a flat `some.nested.key` map — this bridges the two.
 */
export function flattenMessages(nestedMessages: NestedMessages, prefix = ''): Record<string, string> {
  return Object.entries(nestedMessages).reduce<Record<string, string>>((messages, [key, value]) => {
    const messageKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      messages[messageKey] = value;
    } else {
      Object.assign(messages, flattenMessages(value, messageKey));
    }

    return messages;
  }, {});
}

/**
 * Persisted config may still hold a locale dropped from the app (the Berry
 * template shipped `fr` and `ro`), so anything unknown falls back to default.
 */
export function normalizeLocale(locale: unknown): I18n {
  return SUPPORTED_LOCALES.some((supported) => supported.value === locale) ? (locale as I18n) : DEFAULT_LOCALE;
}

export async function loadLocaleMessages(locale: I18n): Promise<Record<string, string>> {
  const messages = locale === 'zh' ? await import('./locales/zh.json') : await import('./locales/en.json');

  return flattenMessages(messages.default as NestedMessages);
}
