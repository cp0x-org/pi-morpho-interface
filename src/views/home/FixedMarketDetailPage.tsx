import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { Alert, CircularProgress, Typography } from '@mui/material';

import { useMidnightBook } from 'hooks/midnight/useMidnightBook';
import { useMidnightMarket } from 'hooks/midnight/useMidnightMarket';
import { useMidnightOnchainPosition } from 'hooks/midnight/useMidnightOnchainPosition';
import { useMidnightOpenOrders } from 'hooks/midnight/useMidnightOpenOrders';
import { useNowInSeconds } from 'hooks/midnight/useNowInSeconds';
import { useTokensMetadata } from 'hooks/midnight/useTokensMetadata';
import { midnightQueryKeys } from 'hooks/midnight/queryKeys';
import { useWalletChainSync } from 'hooks/useWalletChainSync';
import { visuallyHidden } from 'utils/a11y';
import { shortenAddress } from 'utils/formatters';
import {
  findCollateralIndex,
  formatMaturity,
  getMaxLif,
  getOrderReservedAssets,
  isMatured,
  priceToApy,
  rateToLimitInput,
  takerPrice,
  timeToMaturity
} from 'utils/midnight';
import FixedActionPanel from './fixed/FixedActionPanel';
import FixedMarketActivity from './fixed/FixedMarketActivity';
import FixedMarketHeader from './fixed/FixedMarketHeader';
import FixedOrdersTable from './fixed/FixedOrdersTable';
import FixedOrderBook from './fixed/FixedOrderBook';
import FixedPositionCard from './fixed/FixedPositionCard';
import PoweredByMorpho from './fixed/PoweredByMorpho';
import type { FixedActionTab, FixedMarketContext, FixedRatePick } from './fixed/types';
import type { FixedSide } from 'utils/routes';

// ==============================|| FIXED RATE MARKET ||============================== //

export default function FixedMarketDetailPage() {
  const intl = useIntl();
  const { marketId: marketIdParam } = useParams<{ marketId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ratePick, setRatePick] = useState<FixedRatePick>();
  const actionsRef = useRef<HTMLDivElement>(null);
  const { address: user } = useAccount();
  const queryClient = useQueryClient();
  const nowSec = useNowInSeconds(30_000);

  const { marketId, market, marketParams, validationError, state, listed, isLoading, error, isNotFound, refetchState } =
    useMidnightMarket(marketIdParam);
  const chainId = market?.chainId;
  // 100 levels per side is the Midnight API default and what markets.morpho.org shows; the table scrolls.
  const bookQuery = useMidnightBook(marketId, 100, { enabled: !!marketParams });
  const onchain = useMidnightOnchainPosition({ chainId, marketId, marketParams, user });
  const { orders: allOpenOrders, refetch: refetchOpenOrders } = useMidnightOpenOrders(user);
  const openOrders = useMemo(
    () =>
      allOpenOrders.filter(
        (order) => order.chainId === chainId && order.offers.some((offer) => offer.marketId.toLowerCase() === marketId?.toLowerCase())
      ),
    [allOpenOrders, chainId, marketId]
  );

  const collateralIndex = marketParams ? findCollateralIndex(marketParams.loanToken, marketParams.collateralParams) : undefined;
  const collateralParams = collateralIndex != null ? marketParams?.collateralParams[collateralIndex] : undefined;

  const tokenRefs = useMemo(
    () =>
      market
        ? [
            { chainId: market.chainId, address: market.loanToken },
            ...(collateralParams ? [{ chainId: market.chainId, address: collateralParams.token }] : []),
            // An order can quote other markets too; the orders card names them.
            ...openOrders.flatMap((order) =>
              order.offers.flatMap((offer) =>
                offer.collaterals.map((collateral) => ({ chainId: order.chainId, address: collateral.token }))
              )
            )
          ]
        : [],
    [market, collateralParams, openOrders]
  );
  const { getToken } = useTokensMetadata(tokenRefs);

  // Same behaviour as variable markets: follow the market's chain once a wallet is connected.
  useWalletChainSync(chainId);

  // Brings the whole form into view below the fixed app bar (the box's scroll-margin-top), unless it already is.
  // A form taller than the screen is shown from its top.
  const revealActions = useCallback(() => {
    const element = actionsRef.current;
    if (!element) return;
    const { top, bottom } = element.getBoundingClientRect();
    const topInset = parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    if (top >= topInset && bottom <= window.innerHeight) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Tabs differ in height, so a tab switch scrolls only once the new tab has rendered; the router commits the URL
  // change in a transition, after the click handler returns.
  const sideParam = searchParams.get('side');
  const revealPending = useRef(false);
  useEffect(() => {
    if (!revealPending.current) return;
    revealPending.current = false;
    revealActions();
  }, [sideParam, revealActions]);

  const openAction = useCallback(
    (tab: FixedActionTab) => {
      if (searchParams.get('side') === tab) {
        revealActions();
        return;
      }
      revealPending.current = true;
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('side', tab);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams, revealActions]
  );

  // Clicking a book level is the only way to fill a limit field from the book, so it also has to move the panel
  // to that level's taker side: bids are taken by borrowing, asks by lending. Side by side the form is usually in
  // view already and nothing scrolls; stacked on a phone it is the only way to see that the click landed.
  const pickRate = useCallback(
    (side: FixedSide, rateWad: bigint) => {
      setRatePick((previous) => ({ side, percent: rateToLimitInput(rateWad, side), nonce: (previous?.nonce ?? 0) + 1 }));
      openAction(side);
    },
    [openAction]
  );

  const { refetch: refetchOnchain } = onchain;
  // After a transaction the chain is the source of truth; the API catches up with an indexing lag.
  const refresh = useCallback(() => {
    refetchOnchain();
    refetchState();
    refetchOpenOrders();
    queryClient.invalidateQueries({ queryKey: midnightQueryKeys.all });
  }, [refetchOnchain, refetchState, refetchOpenOrders, queryClient]);

  const ctx = useMemo<FixedMarketContext | undefined>(() => {
    if (!market || !marketParams || !marketId || !chainId || collateralIndex == null || !collateralParams) return undefined;
    const loan = getToken(chainId, marketParams.loanToken);
    const collateralToken = getToken(chainId, collateralParams.token);
    const ttm = timeToMaturity(market.maturity, nowSec);
    return {
      chainId,
      marketId,
      market,
      marketParams,
      state,
      sdkMarket: onchain.sdkMarket,
      book: bookQuery.data,
      loan: {
        token: marketParams.loanToken,
        symbol: loan?.symbol ?? shortenAddress(marketParams.loanToken),
        decimals: loan?.decimals,
        logoURI: loan?.logoURI,
        priceUsd: loan?.priceUsd,
        walletBalance: onchain.walletLoanBalance,
        allowanceBundles: onchain.loanAllowanceBundles,
        allowanceMidnight: onchain.loanAllowanceMidnight,
        // Every buy order on the chain draws on the same wallet and allowance, whatever market it quotes.
        reservedByOrders: getOrderReservedAssets(allOpenOrders, chainId, marketParams.loanToken)
      },
      collateral: {
        index: collateralIndex,
        token: collateralParams.token,
        symbol: collateralToken?.symbol ?? shortenAddress(collateralParams.token),
        decimals: collateralToken?.decimals,
        logoURI: collateralToken?.logoURI,
        lltv: collateralParams.lltv,
        liquidationCursor: collateralParams.liquidationCursor,
        oracle: collateralParams.oracle,
        oraclePrice: onchain.oraclePrices[collateralIndex],
        maxLif: getMaxLif(collateralParams.lltv, collateralParams.liquidationCursor),
        positionAmount: onchain.position?.getCollateralBalanceByIndex(collateralIndex) ?? 0n,
        walletBalance: onchain.walletCollateralBalances[collateralIndex],
        allowanceBundles: onchain.collateralAllowanceBundles[collateralIndex],
        allowanceMidnight: onchain.collateralAllowanceMidnight[collateralIndex]
      },
      position: onchain.position,
      openOrders,
      isBundlesAuthorized: onchain.isBundlesAuthorized,
      midnightBundles: onchain.midnightBundles,
      isSetterRatifierAuthorized: onchain.isSetterRatifierAuthorized,
      user,
      nowSec,
      isMatured: isMatured(market.maturity, nowSec),
      settlementFee: onchain.sdkMarket ? onchain.sdkMarket.getSettlementFee(ttm) : (state?.currentSettlementFeeWad ?? 0n),
      ratePick,
      pickRate,
      openAction,
      refresh
    };
  }, [
    market,
    marketParams,
    marketId,
    chainId,
    collateralIndex,
    collateralParams,
    getToken,
    nowSec,
    state,
    bookQuery.data,
    onchain.sdkMarket,
    onchain.walletLoanBalance,
    onchain.loanAllowanceBundles,
    onchain.loanAllowanceMidnight,
    onchain.oraclePrices,
    onchain.position,
    allOpenOrders,
    openOrders,
    onchain.walletCollateralBalances,
    onchain.collateralAllowanceBundles,
    onchain.collateralAllowanceMidnight,
    onchain.isBundlesAuthorized,
    onchain.midnightBundles,
    onchain.isSetterRatifierAuthorized,
    user,
    ratePick,
    pickRate,
    openAction,
    refresh
  ]);

  if (isNotFound) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="alert" color="error">
          <FormattedMessage id="market.notFound" />
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label={intl.formatMessage({ id: 'fixed.market.loading' })} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography role="alert" color="error">
          <FormattedMessage id="fixed.market.error" values={{ message: error.message }} />
        </Typography>
      </Box>
    );
  }

  if (marketParams && collateralIndex == null) {
    return (
      <Box sx={{ padding: 2 }}>
        <Alert severity="error">
          <FormattedMessage id="fixed.market.unsupportedCollateral" />
        </Alert>
      </Box>
    );
  }

  if (validationError || !ctx) {
    return (
      <Box sx={{ padding: 2 }}>
        <Alert severity="error">
          <FormattedMessage id="fixed.market.validationFailed" values={{ message: validationError?.message ?? '' }} />
        </Alert>
      </Box>
    );
  }

  // Best rate a taker can get right now: a lender takes the top ask, a borrower takes the top bid.
  const bestAsk = ctx.book?.asks[0];
  const bestBid = ctx.book?.bids[0];
  const bestLendApy = bestAsk ? priceToApy(takerPrice('lend', bestAsk.price, ctx.settlementFee), ctx.market.maturity, nowSec) : undefined;
  const bestBorrowApy = bestBid
    ? priceToApy(takerPrice('borrow', bestBid.price, ctx.settlementFee), ctx.market.maturity, nowSec)
    : undefined;
  const pair = `${ctx.loan.symbol} / ${ctx.collateral.symbol}`;

  return (
    <Box sx={{ padding: '16px 0px' }}>
      <Box component="h1" sx={visuallyHidden}>
        <FormattedMessage id="fixed.market.heading" values={{ pair, maturity: formatMaturity(intl, ctx.market.maturity, nowSec).date }} />
      </Box>

      <FixedMarketHeader ctx={ctx} bestLendApy={bestLendApy} bestBorrowApy={bestBorrowApy} />

      {listed === false && (
        <Alert severity="warning" sx={{ marginBottom: 3 }}>
          <FormattedMessage id="fixed.list.unlistedWarning" />
        </Alert>
      )}

      {/* Market data and your position on the left, the forms you act with on the right. Clicking a book level
          fills the form beside it, so both stay in view. Stacked on a phone the forms come first. */}
      <Grid container spacing={3} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 7 }} sx={{ order: { xs: 2, md: 1 } }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* The position leads the column, above the order book: it is there, or says there is none. */}
            <FixedPositionCard ctx={ctx} />
            <FixedOrderBook ctx={ctx} isLoading={bookQuery.isFetching} />
            {ctx.openOrders.length > 0 && (
              <Box component="section" aria-labelledby="fixed-open-orders-title">
                <Typography id="fixed-open-orders-title" variant="h4" component="h2" sx={{ marginBottom: 2 }}>
                  <FormattedMessage id="fixed.orders.title" />
                </Typography>
                <FixedOrdersTable
                  orders={ctx.openOrders}
                  getToken={getToken}
                  getOrderCollateral={(orderChainId, orderMarketId) =>
                    orderChainId === ctx.chainId &&
                    orderMarketId.toLowerCase() === ctx.marketId.toLowerCase() &&
                    !ctx.position?.faceValue &&
                    !ctx.position?.debt
                      ? ctx.collateral.positionAmount
                      : undefined
                  }
                  nowSec={nowSec}
                  onCancelled={refresh}
                />
              </Box>
            )}
            <FixedMarketActivity ctx={ctx} />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }} sx={{ order: { xs: 1, md: 2 } }}>
          {/* The app bar is fixed over the top 80px of the page. */}
          <Box ref={actionsRef} sx={{ display: 'flex', flexDirection: 'column', gap: 3, scrollMarginTop: '96px' }}>
            <FixedActionPanel ctx={ctx} />
          </Box>
        </Grid>
      </Grid>

      <PoweredByMorpho />
    </Box>
  );
}
