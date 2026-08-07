import { useMemo } from 'react';
import { Position, AccrualPosition, Market } from '@morpho-org/blue-sdk';
import { isMarketId, MarketId } from '@morpho-org/blue-sdk/lib/types';

export const useFuturePosition = ({
  currentPosition,
  market,
  userAddress,
  marketId: marketIdProp,
  diffBorrowAmount,
  diffCollateralAmount
}: {
  currentPosition: AccrualPosition | null;
  market: Market | null;
  marketId?: string;
  userAddress: `0x${string}` | undefined;
  diffBorrowAmount?: bigint;
  diffCollateralAmount?: bigint;
}) => {
  const marketId = useMemo(() => {
    if (marketIdProp && isMarketId(marketIdProp)) {
      return marketIdProp as MarketId;
    }
    return undefined;
  }, [marketIdProp]);
  return useMemo(() => {
    if (!currentPosition || !market || !marketId || !userAddress) {
      return { futurePosition: null, isChanged: false };
    }

    let newBorrowShares = currentPosition.borrowShares;
    let newSupplyShares = currentPosition.supplyShares;
    let newCollateral = currentPosition.collateral;

    if (diffBorrowAmount && diffBorrowAmount !== 0n) {
      const borrowShares = market.toBorrowShares(diffBorrowAmount);
      newBorrowShares += borrowShares;
    }

    if (diffCollateralAmount && diffCollateralAmount !== 0n) {
      newCollateral += diffCollateralAmount;
    }

    // Если изменений нет
    if ((!diffBorrowAmount || diffBorrowAmount === 0n) && (!diffCollateralAmount || diffCollateralAmount === 0n)) {
      return { futurePosition: currentPosition, isChanged: false };
    }

    const newPosition = new Position({
      user: userAddress,
      marketId,
      supplyShares: newSupplyShares,
      borrowShares: newBorrowShares,
      collateral: newCollateral
    });

    const newAccrualPosition = new AccrualPosition(newPosition, market);
    const isChanged = !!(diffBorrowAmount && diffBorrowAmount !== 0n) || !!(diffCollateralAmount && diffCollateralAmount !== 0n);

    return { futurePosition: newAccrualPosition, isChanged };
  }, [currentPosition, market, userAddress, marketId, diffBorrowAmount, diffCollateralAmount]);
};
