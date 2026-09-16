import { useCallback, useState } from 'react';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import type { Abi, Address, Hex } from 'viem';

export interface TxRequest {
  chainId: number;
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

export interface TxStep {
  key: string;
  label: string;
  /** Built right before sending, so it uses the latest quote and runs after the previous step is mined. */
  build: () => TxRequest;
}

export type TxPhase = 'simulating' | 'signing' | 'confirming';

type SimulateParameters = Parameters<NonNullable<ReturnType<typeof usePublicClient>>['simulateContract']>[0];
type WriteParameters = Parameters<ReturnType<typeof useWriteContract>['writeContractAsync']>[0];

/**
 * Sequential multi-step transactions (approve → authorize → action) on a fixed chain.
 * Every step is simulated with the user as `account` before the wallet is asked to sign, then awaited until mined.
 */
export const useTxSteps = (chainId: number) => {
  const { address, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<TxPhase | undefined>();
  const [currentStep, setCurrentStep] = useState<string | undefined>();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [txHash, setTxHash] = useState<Hex | undefined>();

  const run = useCallback(
    async (steps: TxStep[]) => {
      if (!address || !publicClient || steps.length === 0) return false;
      setIsRunning(true);
      setError(undefined);
      setCompletedSteps([]);
      setTxHash(undefined);
      try {
        if (walletChainId !== chainId) await switchChainAsync({ chainId });
        for (const step of steps) {
          setCurrentStep(step.key);
          const request = step.build();
          setPhase('simulating');
          await publicClient.simulateContract({ ...request, account: address } as unknown as SimulateParameters);
          setPhase('signing');
          const hash = await writeContractAsync(request as unknown as WriteParameters);
          setTxHash(hash);
          setPhase('confirming');
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted`);
          setCompletedSteps((done) => [...done, step.key]);
        }
        return true;
      } catch (runError) {
        const { shortMessage, message } = runError as { shortMessage?: string; message?: string };
        setError(shortMessage ?? message ?? String(runError));
        return false;
      } finally {
        setIsRunning(false);
        setPhase(undefined);
        setCurrentStep(undefined);
      }
    },
    [address, publicClient, walletChainId, chainId, switchChainAsync, writeContractAsync]
  );

  const reset = useCallback(() => {
    setError(undefined);
    setCompletedSteps([]);
    setTxHash(undefined);
  }, []);

  return { run, reset, isRunning, phase, currentStep, completedSteps, error, txHash };
};

export type TxStepsState = ReturnType<typeof useTxSteps>;
