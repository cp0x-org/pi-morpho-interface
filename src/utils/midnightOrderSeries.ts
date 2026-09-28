import { decodeAbiParameters, isAddressEqual, parseAbiItem, type PublicClient } from 'viem';
import { Payload, SetterRatifierUtils } from '@morpho-org/midnight-sdk';
import { deployments } from '@morpho-org/morpho-ts';

import type { MidnightOpenOrder } from 'types/midnight';
import { tryChainAddress } from './midnight';

// ==============================|| MIDNIGHT ORDER SERIES ||============================== //
//
// An order placed on markets.morpho.org is a series of offers with consecutive time windows, all in one group. The public
// API only serves the offer of the current window, so the order's real expiry comes from the chain: the maker approves
// the series' Merkle root on the SetterRatifier, then publishes every offer in one MidnightMempool payload.

const SET_IS_ROOT_RATIFIED = parseAbiItem(
  'event SetIsRootRatified(address indexed caller, address indexed maker, bytes32 indexed root, bool newIsRootRatified)'
);

/** How long after approving the root the payload is looked for (markets.morpho.org sends both back to back). */
const SUBMISSION_WINDOW_SECONDS = 2 * 60 * 60;
const BLOCK_TIME_SECONDS: Record<number, number> = { 1: 12, 8453: 2 };

export interface MidnightOrderSeries {
  /** Unix seconds: start of the first offer and expiry of the last one. */
  start: number;
  expiry: number;
  offers: number;
}

/**
 * Start and expiry of a whole order. Null when it cannot be traced: an order ratified by signature (EcrecoverRatifier)
 * leaves no approval to follow, and the payload may sit outside the searched window. RPC errors are thrown, so a
 * query can retry them.
 */
export const fetchOrderSeries = async (client: PublicClient, order: MidnightOpenOrder): Promise<MidnightOrderSeries | null> => {
  const offer = order.offers[0];
  const setterRatifier = tryChainAddress(order.chainId, 'setterRatifier');
  const mempool = tryChainAddress(order.chainId, 'midnightMempool');
  const deploymentBlock = deployments[order.chainId]?.setterRatifier;
  if (!offer || !setterRatifier || !mempool || deploymentBlock == null || !isAddressEqual(offer.ratifier, setterRatifier)) return null;

  const { root } = SetterRatifierUtils.decodeRatifierData(offer.ratifierData);
  const approvals = await client.getLogs({
    address: setterRatifier,
    event: SET_IS_ROOT_RATIFIED,
    args: { maker: order.maker, root },
    fromBlock: BigInt(deploymentBlock),
    toBlock: 'latest'
  });
  const approval = approvals.filter((log) => log.args.newIsRootRatified).at(-1);
  if (!approval) return null;

  const latest = await client.getBlockNumber();
  const windowBlocks = BigInt(Math.ceil(SUBMISSION_WINDOW_SECONDS / (BLOCK_TIME_SECONDS[order.chainId] ?? 2)));
  const toBlock = approval.blockNumber + windowBlocks < latest ? approval.blockNumber + windowBlocks : latest;
  const submissions = await client.getLogs({ address: mempool, fromBlock: approval.blockNumber, toBlock });

  for (const submission of submissions) {
    let items: Awaited<ReturnType<typeof Payload.decode>>;
    try {
      const [payload] = decodeAbiParameters([{ type: 'bytes' }], submission.data);
      items = await Payload.decode(payload);
    } catch {
      continue; // someone else's malformed payload
    }
    const series = items
      .map((item) => item.offer)
      .filter((item) => item.group?.toLowerCase() === order.group.toLowerCase() && isAddressEqual(item.maker, order.maker));
    if (series.length === 0) continue;
    return {
      start: Math.min(...series.map((item) => Number(item.start))),
      expiry: Math.max(...series.map((item) => Number(item.expiry))),
      offers: series.length
    };
  }
  return null;
};
