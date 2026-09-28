import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useAccount, useSwitchChain } from 'wagmi';

import { getChainName } from 'utils/chains';
import { dispatchError, dispatchInfo, dispatchSuccess } from 'utils/snackbar';

const isForeground = () => document.visibilityState === 'visible' && document.hasFocus();

/**
 * Keeps the connected wallet on the chain a page works with, but only from the tab the user is looking at.
 *
 * The wallet's network is shared by every tab of the site. When each page switched it back on any change, two open pages
 * on different chains (a vault on Ethereum, a fixed-rate market on Base) flipped the wallet between them forever. A tab
 * without the focus now leaves the wallet alone and catches up when it gets the focus back. A declined request is only
 * repeated once the user leaves the tab and returns, so the wallet is not asked again and again.
 */
export const useWalletChainSync = (targetChainId?: number) => {
  const intl = useIntl();
  const { chainId: walletChainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [hasFocus, setHasFocus] = useState(isForeground);
  // The chain already requested since the tab was last shown. The wallet's own popup takes the focus and gives it back,
  // so only coming back to the tab (not the focus returning) allows asking again after a refusal.
  const requested = useRef<number | undefined>(undefined);

  useEffect(() => {
    const updateFocus = () => setHasFocus(isForeground());
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requested.current = undefined;
      updateFocus();
    };
    window.addEventListener('focus', updateFocus);
    window.addEventListener('blur', updateFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', updateFocus);
      window.removeEventListener('blur', updateFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!targetChainId || !walletChainId) return;
    if (walletChainId === targetChainId) {
      // Switching away from here later, by hand, is followed again.
      requested.current = undefined;
      return;
    }
    if (!hasFocus || isPending || requested.current === targetChainId) return;

    requested.current = targetChainId;
    const network = getChainName(targetChainId);
    dispatchInfo(intl.formatMessage({ id: 'network.switching' }, { network }));
    switchChain(
      { chainId: targetChainId },
      {
        onSuccess: () => dispatchSuccess(intl.formatMessage({ id: 'network.switched' }, { network })),
        onError: (err) => dispatchError(intl.formatMessage({ id: 'network.switchFailed' }, { network, message: err.message }))
      }
    );
  }, [targetChainId, walletChainId, hasFocus, isPending, intl, switchChain]);
};
