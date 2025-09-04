import { useQuery } from '@apollo/client';
import React from 'react';

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
  Avatar
} from '@mui/material';
import { MorphoRequests } from '@/api/constants';
import { GetUserPositionsResponse, GetUserPositionsVariables } from 'types/morpho';
import { useAccount } from 'wagmi';
import { formatShortUSDS, formatTokenAmount, shortenAddress } from 'utils/formatters';
import { appoloClients } from '@/api/apollo-client';
import { formatUnits } from 'viem';
import { CuratorIcon } from 'components/CuratorIcon';
import { TokenIcon } from 'components/TokenIcon';

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

export default function DashboardPage() {
  const navigate = useNavigate();
  const { address: userAddress, chain } = useAccount();

  const {
    loading: morphoPositionsLoading,
    error: morphoPositionsError,
    data: morphoPositionsData
  } = useQuery<GetUserPositionsResponse, GetUserPositionsVariables>(MorphoRequests.GetUserPositions, {
    client: appoloClients.morphoApi,
    variables: {
      chainId: Number(chain?.id || 1),
      address: userAddress || ''
    },
    skip: !userAddress
  });

  // Process Morpho positions data
  const morphoPositions = React.useMemo<MorphoPositionsData[]>(() => {
    if (!morphoPositionsData?.userByAddress) return [];

    return morphoPositionsData.userByAddress.marketPositions.map((position) => {
      return {
        marketId: position.market.uniqueKey,
        collateralSymbol: position.market.collateralAsset.symbol,
        loanSymbol: position.market.loanAsset.symbol,
        collateralBalance: position.state.collateral || '0',
        loanBalance: position.state.borrowAssets || '0',
        collateralDecimal: position.market.collateralAsset.decimals,
        loanDecimal: position.market.loanAsset.decimals,
        borrowUsd: position.state.borrowAssetsUsd || '0',
        supplyUsd: position.state.supplyAssetsUsd || '0',
        borrowApy: position.market.state.borrowApy || '0'
      };
    });
  }, [morphoPositionsData]);

  // Process Morpho vault positions data
  const morphoVaultPositions = React.useMemo(() => {
    if (!morphoPositionsData?.userByAddress) return [];

    return morphoPositionsData.userByAddress.vaultPositions;
  }, [morphoPositionsData]);

  if (morphoPositionsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (morphoPositionsError) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h4">Positions not found.</Typography>
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
      {morphoVaultPositions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h2" gutterBottom sx={{ marginBottom: 1 }}>
            Morpho Vaults {chain?.name && <> ({chain?.name})</>}
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="morpho vaults table">
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
                {morphoVaultPositions.map((position) => (
                  <TableRow
                    key={position.vault.address}
                    hover
                    onClick={() => navigate(`/earn/vault/${position.vault.address}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TokenIcon symbol={position.vault.asset.symbol} />
                        {position.vault.name || shortenAddress(position.vault.address)}
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
                        {position.vault.state.curators?.map((curator) => (
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

      {morphoPositions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h2" gutterBottom sx={{ marginBottom: 1 }}>
            Morpho Markets {chain?.name && <> ({chain?.name})</>}
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="morpho markets table">
              <TableHead>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>Collateral</TableCell>
                  <TableCell>Loan</TableCell>
                  <TableCell>Borrow APY</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {morphoPositions.map((position) => (
                  <TableRow
                    key={position.marketId}
                    hover
                    onClick={() => navigate(`/borrow/market/${position.marketId}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      {position.collateralSymbol}/{position.loanSymbol}
                    </TableCell>
                    <TableCell>
                      {parseFloat(position.collateralBalance) > 0 ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TokenIcon symbol={position.collateralSymbol} />
                          {Number(formatTokenAmount(position.collateralBalance, position.collateralDecimal)).toFixed(6)}{' '}
                          {position.collateralSymbol}
                        </Box>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {parseFloat(position.loanBalance) > 0 ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TokenIcon symbol={position.loanSymbol} />
                          {Number(formatTokenAmount(position.loanBalance, position.loanDecimal)).toFixed(6)} {position.loanSymbol}
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
  );
}
