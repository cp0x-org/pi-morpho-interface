import { useQuery } from '@apollo/client';
import React from 'react';

import { useNavigate, Link as RouterLink } from 'react-router-dom';
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
  Chip,
  Link
} from '@mui/material';
import { visuallyHidden } from 'utils/a11y';
import { MorphoRequests } from '@/api/constants';
import { GetUserPositionsResponse, GetUserPositionsVariables } from 'types/morpho';
import { useAccount } from 'wagmi';
import { DECIMALS_SCALE_FACTOR, formatShortUSDS, formatTokenAmount, shortenAddress } from 'utils/formatters';
import { appoloClients } from '@/api/apollo-client';
import { formatUnits } from 'viem';
import { CuratorIcon } from 'components/CuratorIcon';
import { TokenIcon } from 'components/TokenIcon';
import { getChainName } from 'utils/chains';

interface MorphoPositionsData {
  marketId: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralBalance: string;
  loanBalance: string;
  collateralDecimal: number;
  loanDecimal: number;
  borrowUsd: string;
  supplyUsd: string;
  borrowApy: string;
}

// All chains supported by Morpho
const MORPHO_CHAIN_IDS = [1, 8453, 137, 42161, 130, 10, 480] as const;

function useChainPositions(chainId: number, address: string | undefined) {
  return useQuery<GetUserPositionsResponse, GetUserPositionsVariables>(MorphoRequests.GetUserPositions, {
    client: appoloClients.morphoApi,
    variables: { chainId, address: address || '' },
    skip: !address
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { address: userAddress } = useAccount();

  // Parallel queries for each chain — hooks must be called unconditionally
  const chain1 = useChainPositions(1, userAddress);
  const chain8453 = useChainPositions(8453, userAddress);
  const chain137 = useChainPositions(137, userAddress);
  const chain42161 = useChainPositions(42161, userAddress);
  const chain130 = useChainPositions(130, userAddress);
  const chain10 = useChainPositions(10, userAddress);
  const chain480 = useChainPositions(480, userAddress);

  const chainResults = [
    { chainId: 1, result: chain1 },
    { chainId: 8453, result: chain8453 },
    { chainId: 137, result: chain137 },
    { chainId: 42161, result: chain42161 },
    { chainId: 130, result: chain130 },
    { chainId: 10, result: chain10 },
    { chainId: 480, result: chain480 }
  ];

  const anyLoading = chainResults.some((c) => c.result.loading);

  const chainsWithData = React.useMemo(() => {
    return chainResults
      .map(({ chainId, result }) => {
        const user = result.data?.userByAddress;
        if (!user) return null;

        const marketPositions: MorphoPositionsData[] = user.marketPositions
          .filter((p) => parseFloat(p.state.collateral || '0') > 0 || parseFloat(p.state.borrowAssets || '0') > 0)
          .map((position) => ({
            marketId: position.market.marketId,
            collateralSymbol: position.market.collateralAsset.symbol,
            loanSymbol: position.market.loanAsset.symbol,
            collateralBalance: position.state.collateral || '0',
            loanBalance: position.state.borrowAssets || '0',
            collateralDecimal: position.market.collateralAsset.decimals,
            loanDecimal: position.market.loanAsset.decimals,
            borrowUsd: position.state.borrowAssetsUsd || '0',
            supplyUsd: position.state.supplyAssetsUsd || '0',
            borrowApy: position.market.state.borrowApy || '0'
          }));

        const vaultPositions = user.vaultPositions.filter((p) => parseFloat(p.state.assets || '0') > 0);

        if (marketPositions.length === 0 && vaultPositions.length === 0) return null;

        return { chainId, marketPositions, vaultPositions };
      })
      .filter(Boolean) as { chainId: number; marketPositions: MorphoPositionsData[]; vaultPositions: any[] }[];
  }, chainResults.map((c) => c.result.data));

  if (!userAddress) {
    return (
      <Box sx={{ padding: 2 }}>
        <Box component="h1" sx={visuallyHidden}>
          Dashboard: your Morpho positions
        </Box>
        <Typography variant="h4" component="p" role="status">
          Connect wallet to see your positions.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Box component="h1" sx={visuallyHidden}>
        Dashboard: your Morpho positions
      </Box>
      {anyLoading && chainsWithData.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
          <CircularProgress aria-label="Loading your positions" />
        </Box>
      )}

      {!anyLoading && chainsWithData.length === 0 && (
        <Box sx={{ padding: 2 }}>
          <Typography variant="h4" component="p" role="status">
            No positions found across any network.
          </Typography>
        </Box>
      )}

      {chainsWithData.map(({ chainId, marketPositions, vaultPositions }) => (
        <Box key={chainId} sx={{ marginBottom: 5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, marginBottom: 2 }}>
            <Typography variant="h2" component="h2">
              {getChainName(chainId)}
            </Typography>
            {anyLoading && <CircularProgress size={16} aria-label={`Refreshing ${getChainName(chainId)} positions`} />}
          </Box>

          {vaultPositions.length > 0 && (
            <Box sx={{ marginBottom: 3 }}>
              <Typography variant="h4" component="h3" gutterBottom sx={{ marginBottom: 1, color: 'text.secondary' }}>
                Vaults
              </Typography>
              <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
                <Table sx={{ minWidth: 650 }} aria-label={`Your vault positions on ${getChainName(chainId)}`}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Vault</TableCell>
                      <TableCell>Balance</TableCell>
                      <TableCell>APY</TableCell>
                      <TableCell>Total Deposits (USD)</TableCell>
                      <TableCell>Curators</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {vaultPositions.map((position) => (
                      <TableRow
                        key={position.vault.address}
                        hover
                        onClick={() => navigate(`/earn/vault/${position.vault.address}`)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TokenIcon symbol={position.vault.asset.symbol} />
                            <Link
                              component={RouterLink}
                              to={`/earn/vault/${position.vault.address}`}
                              color="inherit"
                              underline="none"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Open vault ${position.vault.name || shortenAddress(position.vault.address)} on ${getChainName(chainId)}`}
                            >
                              {position.vault.name || shortenAddress(position.vault.address)}
                            </Link>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {Number(formatUnits(BigInt(position.state.assets), position.vault.asset.decimals)).toFixed(6)} (
                          {Number(position.state.assetsUsd).toFixed(2)} $)
                        </TableCell>
                        <TableCell>{(Number(position.vault.state.avgNetApy) * 100).toFixed(2)} %</TableCell>
                        <TableCell>$ {formatShortUSDS(parseFloat(position.vault.state.totalAssetsUsd))}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {position.vault.state.curators?.map((curator: any) => (
                              <Box key={curator.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CuratorIcon symbol={curator.id} /> {curator.name ? curator.name : curator.id}
                              </Box>
                            ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {marketPositions.length > 0 && (
            <Box>
              <Typography variant="h4" component="h3" gutterBottom sx={{ marginBottom: 1, color: 'text.secondary' }}>
                Markets
              </Typography>
              <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label={`Your market positions on ${getChainName(chainId)}`}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Market</TableCell>
                      <TableCell>Collateral</TableCell>
                      <TableCell>Loan</TableCell>
                      <TableCell>Borrow APY</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {marketPositions.map((position) => (
                      <TableRow
                        key={position.marketId}
                        hover
                        onClick={() => navigate(`/borrow/market/${position.marketId}?chainId=${chainId}`)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Link
                            component={RouterLink}
                            to={`/borrow/market/${position.marketId}?chainId=${chainId}`}
                            color="inherit"
                            underline="none"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Open market ${position.collateralSymbol}/${position.loanSymbol} on ${getChainName(chainId)}`}
                          >
                            {position.collateralSymbol}/{position.loanSymbol}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {parseFloat(position.collateralBalance) > 0 ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <TokenIcon symbol={position.collateralSymbol} avatarProps={{ alt: '' }} />
                              {formatTokenAmount(
                                position.collateralBalance,
                                position.collateralDecimal,
                                position.collateralDecimal / DECIMALS_SCALE_FACTOR
                              )}{' '}
                              {position.collateralSymbol}
                            </Box>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {parseFloat(position.loanBalance) > 0 ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <TokenIcon symbol={position.loanSymbol} avatarProps={{ alt: '' }} />
                              {formatTokenAmount(
                                position.loanBalance,
                                position.loanDecimal,
                                position.loanDecimal / DECIMALS_SCALE_FACTOR
                              )}{' '}
                              {position.loanSymbol}
                            </Box>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{(Number(position.borrowApy) * 100).toFixed(2)} %</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
