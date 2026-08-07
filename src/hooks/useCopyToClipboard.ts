import { useState } from 'react';
import { useIntl } from 'react-intl';

type CopyToClipboardResult = {
  copySuccess: boolean | null;
  copySuccessMsg: string | null;
  copyToClipboard: (text: string) => Promise<void>;
};

/**
 * Hook to handle copying text to clipboard with success status management
 * @returns {CopyToClipboardResult} Object containing copySuccess state and copyToClipboard function
 */
export const useCopyToClipboard = (): CopyToClipboardResult => {
  const intl = useIntl();
  const [copySuccess, setCopySuccess] = useState<boolean | null>(null);
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  const copyToClipboard = async (text: string) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setCopySuccessMsg(intl.formatMessage({ id: 'common.copied' }));
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopySuccess(false);
      setCopySuccessMsg(intl.formatMessage({ id: 'common.copyFailed' }));
    }
  };

  return { copySuccess, copySuccessMsg, copyToClipboard };
};
