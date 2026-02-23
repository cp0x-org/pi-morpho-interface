import { gql } from '@apollo/client';

export const ApiUrls = {
  // morphoApi: 'https://api.morpho.org/graphql', // original with restrictions
  morphoApi: 'https://pi.cp0x.com/proxymorpho/', // cp0x proxy, no restrictions
  ethGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
  baseGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/71ZTy1veF9twER9CLMnPWeLQ7GZcwKsjmygejrgKirqs',
  polygonGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/EhFokmwryNs7qbvostceRqVdjc3petuD13mmdUiMBw8Y',
  unichainGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/ESbNRVHte3nwhcHveux9cK4FFAZK3TTLc5mKQNtpYgmu'
};

export const MorphoRequests = {
  //EarnPage
  GetVaultsData: gql`
    query GetVaults($chainId: Int!) {
      vaults(where: { chainId_in: [$chainId] }, first: 1000) {
        items {
          address
          symbol
          name
          chain {
            id
            network
          }
          asset {
            id
            symbol
            address
            decimals
            name
          }
          state {
            dailyNetApy
            totalAssetsUsd
            curators {
              id
              name
              image
              addresses {
                address
                chainId
              }
            }
          }
        }
      }
    }
  `,
  // borrowpage
  GetMorphoMarkets: gql`
    query GetMarkets($chainId: Int!) {
      markets(where: { chainId_in: [$chainId], whitelisted: true }, first: 1000) {
        items {
          uniqueKey
          lltv
          oracleAddress
          irmAddress
          loanAsset {
            address
            symbol
            decimals
          }
          collateralAsset {
            address
            symbol
            decimals
          }
          state {
            dailyNetBorrowApy
            dailyNetSupplyApy
            fee
            utilization
            dailyNetBorrowApy
            dailyNetSupplyApy
            fee
            utilization
            netBorrowApy
            avgNetBorrowApy
            avgNetSupplyApy
            netSupplyApy
          }
        }
      }
    }
  `,
  // vaultdetailpage
  GetMorprhoVaultByAddress: gql`
    query GetVaultDetails($address: String!, $chain: Int!) {
      vaults(where: { address_in: [$address], chainId_in: [$chain] }, first: 1) {
        items {
          address
          symbol
          name
          whitelisted
          asset {
            id
            symbol
            address
            decimals
          }
          chain {
            id
            network
          }
          state {
            dailyNetApy
            totalAssetsUsd
          }
        }
      }
    }
  `,
  // marketDetailPage
  GetMorphoMarketByAddress: gql`
    query GetMarketByAddress($uniqueKey: String!) {
      markets(where: { uniqueKey_in: [$uniqueKey] }, first: 1) {
        items {
          uniqueKey
          lltv
          oracleAddress
          irmAddress
          loanAsset {
            address
            symbol
            decimals
          }
          collateralAsset {
            address
            symbol
            decimals
          }
          state {
            borrowAssets
            supplyAssets
            fee
            utilization
            dailyNetBorrowApy
            totalLiquidityUsd
            sizeUsd
          }
        }
      }
    }
  `,
  GetUserPositions: gql`
    query Vault($chainId: Int!, $address: String!) {
      userByAddress(chainId: $chainId, address: $address) {
        address
        marketPositions {
          market {
            uniqueKey
            collateralAsset {
              address
              name
              decimals
              symbol
            }
            loanAsset {
              address
              name
              symbol
              decimals
            }
            state {
              borrowApy
            }
          }
          state {
            borrowAssets
            borrowAssetsUsd
            supplyAssets
            supplyAssetsUsd
            collateralUsd
            collateral
          }
        }
        vaultPositions {
          vault {
            address
            name
            state {
              totalAssetsUsd
              avgNetApy
              curators {
                id
                name
              }
            }
            asset {
              name
              decimals
              symbol
            }
          }
          state {
            assets
            assetsUsd
          }
        }
      }
    }
  `
};

export const SubgraphRequests = {
  // GetVaults: gql``,
  // GetMarkets: gql``,
  // GetVaultByAddress: gql``,
  // GetMarketByAddress: gql``,
  GetMetaMorphos: gql`
    query GetMetaMorphos {
      metaMorphos(first: 1000) {
        id
        name
        symbol
        asset {
          id
          name
          symbol
        }
        timelock
      }
    }
  `,
  GetMetamorphoPositions: gql`
    query GetMetamorphoPositions($account: String!) {
      metaMorphoPositions(where: { account: $account }) {
        id
        lastAssetsBalance
        lastAssetsBalanceUSD
        metaMorpho {
          id
          name
          asset {
            symbol
            name
            decimals
            id
          }
          curator {
            id
          }
        }
      }
    }
  `,
  GetMorphoMarkets: gql`
    query GetMorphoMarkets {
      markets(first: 1000) {
        maximumLTV
        lltv
        name
        rates {
          rate
          side
          type
        }
        id
        irm
        totalCollateral
        totalSupply
        totalSupplyShares
        totalValueLockedUSD
        isActive
        borrowedToken {
          name
          symbol
          id
          decimals
        }
        inputToken {
          decimals
          id
          name
          symbol
        }
        totalBorrow
      }
    }
  `,
  GetMorphoMarketPositions: gql`
    query GetMorphoMarketPositions($account: String!) {
      account(id: $account) {
        id
        positionCount
        openPositionCount
        positions {
          id
          market {
            id
            name
            inputToken {
              id
              name
              symbol
              decimals
            }
            borrowedToken {
              id
              decimals
              name
              symbol
            }
          }
          asset {
            id
            symbol
            name
            decimals
          }
          side
          isCollateral
          balance
          hashClosed
          hashOpened
        }
      }
    }
  `
};

// export const MorphoRequests = {
//   // GetVaultsApy: gql``,
//   // GetCuratorsData: gql``
// };
