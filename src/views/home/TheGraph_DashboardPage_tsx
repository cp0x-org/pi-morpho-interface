import { useQuery } from '@apollo/client';
import React, { useState } from 'react';

import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  CircularProgress,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TableSortLabel,
  Tooltip,
  Grid,
  TextField,
  Autocomplete,
  Chip,
  SelectChangeEvent,
  Avatar
} from '@mui/material';
import { UnfoldMore } from '@mui/icons-material';
import { SubgraphRequests } from '@/api/constants';
import {
  MetaMorphoPositionsQueryResponse,
  MorphoMarket,
  MorphoMarketPositionsQueryResponse,
  MorphoMarketsQueryResponse,
  MorphoPosition
} from 'types/metamorphos';
import { useAccount } from 'wagmi';
import { formatTokenAmount, shortenAddress } from 'utils/formatters';
import { useConfigChainId } from 'hooks/useConfigChainId';

type SortableField = 'loanAsset' | 'collateralAsset' | 'lltv' | 'utilization' | 'borrowApy' | 'supplyApy';
type SortOrder = 'asc' | 'desc';

// Component for displaying token icons
interface TokenIconProps {
  symbol: string;
}

interface MarketPositionsData {
  marketId: string; // market id
  marketName: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralBalance: number;
  loanBalance: number;
}

const TokenIcon = ({ symbol }: TokenIconProps) => {
  const normalizedSymbol = symbol.toLowerCase();
  const iconUrl = `/tokens/${normalizedSymbol}.svg`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar
        src={iconUrl}
        alt={`${symbol} icon`}
        sx={{ width: 24, height: 24 }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </Box>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { address: userAddress, chain } = useAccount();

  const {
    loading: positionsLoading,
    error: positionsError,
    data: rawPositionsData
  } = useQuery<MorphoMarketPositionsQueryResponse>(SubgraphRequests.GetMorphoMarketPositions, {
    variables: { account: userAddress }
  });

  const {
    loading: earnPositionsLoading,
    error: earnPositionsError,
    data: earnPositionsData
  } = useQuery<MetaMorphoPositionsQueryResponse>(SubgraphRequests.GetMetamorphoPositions, {
    variables: { account: userAddress }
  });
  const handleVaultClick = (vaultAddress: string) => {
    navigate(`/earn/vault/${vaultAddress}`);
  };
  // Combine data from both sources
  const borrowPositionsData = React.useMemo<MarketPositionsData[]>(() => {
    if (!rawPositionsData || !rawPositionsData.account || rawPositionsData.account.openPositionCount === 0) {
      return [];
    }

    const openPositions = rawPositionsData.account.positions.filter((position) => position.hashClosed === null);

    const groupedByMarket = new Map<string, MarketPositionsData>();

    for (const position of openPositions) {
      const marketId = position.market.id;
      const marketName = position.market.name;
      const existing = groupedByMarket.get(marketId);

      const balance = parseFloat(position.balance) / Math.pow(10, position.asset.decimals);

      if (position.isCollateral) {
        // Collateral position
        const collateralSymbol = position.asset.symbol;

        if (existing) {
          existing.collateralBalance = balance;
          existing.collateralSymbol = collateralSymbol;
        } else {
          groupedByMarket.set(marketId, {
            marketId: marketId,
            marketName: marketName,
            collateralSymbol: collateralSymbol,
            loanSymbol: '',
            collateralBalance: balance,
            loanBalance: 0
          });
        }
      } else {
        // Loan position
        const loanSymbol = position.asset.symbol;

        if (existing) {
          existing.loanBalance = balance;
          existing.loanSymbol = loanSymbol;
        } else {
          groupedByMarket.set(marketId, {
            marketId: marketId,
            marketName: marketName,
            collateralSymbol: '',
            loanSymbol: loanSymbol,
            collateralBalance: 0,
            loanBalance: balance
          });
        }
      }
    }

    return Array.from(groupedByMarket.values());
  }, [rawPositionsData]);

  const {
    loading: graphLoading,
    error: graphError,
    data: graphData
  } = useQuery<MorphoMarketsQueryResponse>(SubgraphRequests.GetMorphoMarkets);

  // Combine data from both sources
  const combinedMarkets = React.useMemo(() => {
    if (!graphData) return [];

    const markets = graphData.markets.map((market) => {
      let borrowApy: number | undefined = undefined;
      let supplyApy: number | undefined = undefined;

      market.rates.forEach((rate) => {
        if (rate.side === 'BORROWER') {
          borrowApy = parseFloat(rate.rate);
        } else if (rate.side === 'LENDER') {
          supplyApy = parseFloat(rate.rate);
        }
      });

      return {
        ...market,
        borrowApy,
        supplyApy
      };
    });

    return markets;
  }, [graphData]);

  if (graphLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (graphError) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography color="error">Error loading markets: {graphError.message}</Typography>
      </Box>
    );
  }

  if (!userAddress) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h4">Connect wallet to see your positions.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }} alignContent={'center'} margin={'auto'}>
      {earnPositionsData?.metaMorphoPositions && earnPositionsData.metaMorphoPositions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h2" gutterBottom sx={{ marginBottom: 1 }}>
            Earn {chain?.name && <> ({chain?.name})</>}
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="positions table">
              <TableHead>
                <TableRow>
                  <TableCell>Vault</TableCell>
                  <TableCell>Balance</TableCell>
                  <TableCell>USD Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {earnPositionsData.metaMorphoPositions.map((position) => (
                  <TableRow
                    key={position.id}
                    hover
                    onClick={() => navigate(`/earn/vault/${position.metaMorpho.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {position.metaMorpho.asset && <TokenIcon symbol={position.metaMorpho.asset.symbol} />}
                        {position.metaMorpho.name || shortenAddress(position.metaMorpho.id)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {formatTokenAmount(position.lastAssetsBalance, position.metaMorpho.asset.decimals)} {position.metaMorpho.asset.symbol}
                    </TableCell>
                    <TableCell>${parseFloat(position.lastAssetsBalanceUSD).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {borrowPositionsData && borrowPositionsData.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h2" gutterBottom sx={{ marginBottom: 1 }}>
            Borrow {chain?.name && <> ({chain?.name})</>}
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="positions table">
              <TableHead>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>Collateral</TableCell>
                  <TableCell>Loan</TableCell>
                  <TableCell>Borrow APY</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {borrowPositionsData.map((position) => {
                  const marketData = combinedMarkets.find((market) => market.id === position.marketId);
                  const borrowApy = marketData?.borrowApy || 0;

                  return (
                    <TableRow
                      key={position.marketId}
                      hover
                      onClick={() => navigate(`/borrow/market/${position.marketId}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{position.marketName}</TableCell>
                      <TableCell>
                        {position.collateralBalance > 0 ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TokenIcon symbol={position.collateralSymbol} />
                            {position.collateralSymbol} {position.collateralBalance.toFixed(4)}
                          </Box>
                        ) : (
                          '-'
                        )}
                      </TableCell>

                      <TableCell>
                        {position.loanBalance > 0 ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TokenIcon symbol={position.loanSymbol} />
                            {position.loanSymbol} {position.loanBalance.toFixed(4)}
                          </Box>
                        ) : (
                          '-'
                        )}
                      </TableCell>

                      <TableCell>{(borrowApy * 100).toFixed(2)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
}
