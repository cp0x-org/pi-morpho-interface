import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import type { Address, ContractFunctionParameters, Hex } from 'viem';
import {
  AccrualPosition,
  Market as MidnightSdkMarket,
  midnightAbi,
  type MarketParams as MidnightMarketParams,
  type SettlementFeeCbps
} from '@morpho-org/midnight-sdk';

import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { morphoOracleConfig } from '@/appconfig/abi/MorphoOracle';
import { getMidnightBundlesAddress, nowInSeconds, tryChainAddress } from 'utils/midnight';

type MarketStateResult = readonly [bigint, bigint, bigint, bigint, number, number, number, number, number, number, number, number, number];
type PositionResult = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

interface Call {
  key: string;
  contract: ContractFunctionParameters & { chainId: number };
}

interface UseMidnightOnchainPositionParams {
  chainId?: number;
  marketId?: Hex;
  /** Validated market params (see `toMarketParams`). Reads are disabled until they are available. */
  marketParams?: MidnightMarketParams;
  user?: Address;
  refetchInterval?: number;
}

/**
 * Source of truth for Midnight forms: one multicall on the market chain with market state, oracle prices and,
 * when a wallet is connected, the position, wallet balances, allowances and MidnightBundles authorization.
 */
export const useMidnightOnchainPosition = ({
  chainId,
  marketId,
  marketParams,
  user,
  refetchInterval = 30_000
}: UseMidnightOnchainPositionParams) => {
  const bundles = chainId ? getMidnightBundlesAddress(chainId) : undefined;
  const setterRatifier = chainId ? tryChainAddress(chainId, 'setterRatifier') : undefined;

  const calls = useMemo<Call[]>(() => {
    if (!chainId || !marketId || !marketParams) return [];
    const midnight = marketParams.midnight;
    const list: Call[] = [];
    const push = (key: string, contract: ContractFunctionParameters) => list.push({ key, contract: { ...contract, chainId } });

    push('marketState', { address: midnight, abi: midnightAbi, functionName: 'marketState', args: [marketId] });
    marketParams.collateralParams.forEach((collateral, index) =>
      push(`oraclePrice:${index}`, { address: collateral.oracle, abi: morphoOracleConfig.abi, functionName: 'price', args: [] })
    );

    if (user) {
      push('position', { address: midnight, abi: midnightAbi, functionName: 'position', args: [marketId, user] });
      push('walletLoan', { address: marketParams.loanToken, abi: erc20ABIConfig.abi, functionName: 'balanceOf', args: [user] });
      marketParams.collateralParams.forEach((collateral, index) => {
        push(`collateral:${index}`, {
          address: midnight,
          abi: midnightAbi,
          functionName: 'collateral',
          args: [marketId, user, BigInt(index)]
        });
        push(`walletCollateral:${index}`, { address: collateral.token, abi: erc20ABIConfig.abi, functionName: 'balanceOf', args: [user] });
        push(`collateralAllowanceMidnight:${index}`, {
          address: collateral.token,
          abi: erc20ABIConfig.abi,
          functionName: 'allowance',
          args: [user, midnight]
        });
        if (bundles) {
          push(`collateralAllowanceBundles:${index}`, {
            address: collateral.token,
            abi: erc20ABIConfig.abi,
            functionName: 'allowance',
            args: [user, bundles]
          });
        }
      });
      // A resting order that buys (an early exit of a loan) is paid from the wallet when it fills, through Midnight itself.
      push('loanAllowanceMidnight', {
        address: marketParams.loanToken,
        abi: erc20ABIConfig.abi,
        functionName: 'allowance',
        args: [user, midnight]
      });
      if (setterRatifier) {
        push('isSetterRatifierAuthorized', {
          address: midnight,
          abi: midnightAbi,
          functionName: 'isAuthorized',
          args: [user, setterRatifier]
        });
      }
      if (bundles) {
        push('loanAllowanceBundles', {
          address: marketParams.loanToken,
          abi: erc20ABIConfig.abi,
          functionName: 'allowance',
          args: [user, bundles]
        });
        push('isBundlesAuthorized', { address: midnight, abi: midnightAbi, functionName: 'isAuthorized', args: [user, bundles] });
      }
    }
    return list;
  }, [chainId, marketId, marketParams, user, bundles, setterRatifier]);

  const { data, isLoading, isFetching, isError, error, refetch } = useReadContracts({
    contracts: calls.map((call) => call.contract),
    allowFailure: true,
    query: { enabled: calls.length > 0, refetchInterval }
  });

  const result = useMemo(() => {
    const byKey = new Map<string, unknown>();
    calls.forEach((call, index) => {
      const entry = data?.[index];
      if (entry?.status === 'success') byKey.set(call.key, entry.result);
    });
    const read = <T>(key: string) => byKey.get(key) as T | undefined;
    const indices = Array.from({ length: marketParams?.collateralParams.length ?? 0 }, (_, index) => index);

    const state = read<MarketStateResult>('marketState');
    const sdkMarket =
      state && marketParams
        ? new MidnightSdkMarket({
            params: marketParams,
            totalUnits: state[0],
            lossFactor: state[1],
            withdrawable: state[2],
            continuousFeeCredit: state[3],
            settlementFeeCbps: [state[4], state[5], state[6], state[7], state[8], state[9], state[10]] as SettlementFeeCbps,
            continuousFee: state[11],
            tickSpacing: state[12]
          })
        : undefined;

    const rawPosition = read<PositionResult>('position');
    const positionCollateral = indices.map((index) => read<bigint>(`collateral:${index}`));
    let position: AccrualPosition | undefined;
    if (user && rawPosition && sdkMarket && positionCollateral.every((amount) => amount !== undefined)) {
      position = new AccrualPosition(
        {
          user,
          credit: rawPosition[0],
          pendingFee: rawPosition[1],
          lastLossFactor: rawPosition[2],
          lastAccrual: rawPosition[3],
          debt: rawPosition[4],
          collateralBitmap: rawPosition[5],
          collateral: positionCollateral as bigint[]
        },
        sdkMarket
      );
      try {
        position = position.accrueInterest(nowInSeconds());
      } catch (accrualError) {
        console.warn('Midnight position accrual failed, using the raw on-chain position', accrualError);
      }
    }

    return {
      sdkMarket,
      position,
      oraclePrices: indices.map((index) => read<bigint>(`oraclePrice:${index}`)),
      walletLoanBalance: read<bigint>('walletLoan'),
      loanAllowanceBundles: read<bigint>('loanAllowanceBundles'),
      loanAllowanceMidnight: read<bigint>('loanAllowanceMidnight'),
      walletCollateralBalances: indices.map((index) => read<bigint>(`walletCollateral:${index}`)),
      collateralAllowanceBundles: indices.map((index) => read<bigint>(`collateralAllowanceBundles:${index}`)),
      collateralAllowanceMidnight: indices.map((index) => read<bigint>(`collateralAllowanceMidnight:${index}`)),
      isBundlesAuthorized: read<boolean>('isBundlesAuthorized'),
      isSetterRatifierAuthorized: read<boolean>('isSetterRatifierAuthorized')
    };
  }, [calls, data, marketParams, user]);

  return { ...result, midnightBundles: bundles, setterRatifier, isLoading, isFetching, isError, error, refetch };
};
