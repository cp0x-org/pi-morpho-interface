import { useCallback, useEffect, useState } from 'react';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

export type TxState = 'idle' | 'submitting' | 'submitted' | 'confirmed' | 'error';

export const useWriteTransaction = () => {
  const [txState, setTxState] = useState<TxState>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [txError, setTxError] = useState<Error | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  const { writeContractAsync } = useWriteContract();

  const {
    isSuccess: isTxConfirmed,
    isError: isTxConfirmError,
    error: txConfirmError
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash }
  });

  const sendTransaction = useCallback(
    async (config: Parameters<typeof writeContractAsync>[0]) => {
      try {
        setTxState('submitting');
        setTxError(null);
        setIsCompleted(false);
        setTxHash(undefined);

        const hash = await writeContractAsync(config);
        setTxHash(hash);
        setTxState('submitted');
      } catch (err) {
        setTxState('error');
        setTxError(err as Error);
      }
    },
    [writeContractAsync]
  );

  useEffect(() => {
    if (isTxConfirmed && txState === 'submitted') {
      setTxState('confirmed');
      setIsCompleted(true);
    } else if (isTxConfirmError && txState === 'submitted') {
      setTxState('error');
      setTxError(txConfirmError as Error);
    }
  }, [isTxConfirmed, isTxConfirmError, txConfirmError, txState]);

  const resetTx = useCallback(() => {
    setTxState('idle');
    setTxHash(undefined);
    setTxError(null);
    setIsCompleted(false);
  }, []);

  return {
    sendTransaction,
    txState,
    txHash,
    txError,
    isCompleted,
    isTxConfirmed,
    resetTx
  };
};
