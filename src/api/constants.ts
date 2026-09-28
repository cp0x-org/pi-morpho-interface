import { gql } from '@apollo/client';

export const ApiUrls = {
  // morphoApi: 'https://api.morpho.org/graphql', // original with restrictions
  morphoApi: 'https://pi.cp0x.com/proxymorpho/', // cp0x proxy, no restrictions, base
  // morphoApi: 'https://pi.cp0x.com/proxymorpho/graphql', // cp0x proxy, no restrictions
  // Morpho Midnight (fixed-rate markets) REST API. Documented as a "Private API": keep it configurable so it can be moved
  // behind the cp0x proxy (the proxy needs its own location for /v0/midnight/).
  midnightApi: 'https://api.morpho.org/v0/midnight',
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
    query GetVaults {
      vaults(first: 1000) {
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
            avgNetApy
            totalAssets
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
    query GetMarkets {
      markets(where: { listed: true }, first: 1000) {
        items {
          marketId
          lltv
          irmAddress
          chain {
            id
            network
          }
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
            netBorrowApy
            avgNetBorrowApy
            avgNetSupplyApy
            netSupplyApy
            totalLiquidity
            totalLiquidityUsd
            size
            sizeUsd
          }
        }
      }
    }
  `,
  // vaultdetailpage
  GetMorprhoVaultByAddress: gql`
    query GetVaultDetails($address: String!) {
      vaults(where: { address_in: [$address] }, first: 1) {
        items {
          address
          symbol
          name
          listed
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
            avgNetApy
            totalAssetsUsd
          }
        }
      }
    }
  `,
  // marketDetailPage
  // `chainIds: null` searches every network (used to recover a wrong or missing ?chainId=).
  GetMorphoMarketByAddress: gql`
    query GetMarketByAddress($marketId: String!, $chainIds: [Int!]) {
      markets(where: { uniqueKey_in: [$marketId], chainId_in: $chainIds }, first: 10) {
        items {
          marketId
          lltv
          oracle {
            address
          }
          irmAddress
          chain {
            id
            network
          }
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
            dailyNetSupplyApy
            totalLiquidityUsd
            sizeUsd
          }
        }
      }
    }
  `,
  // fixed-rate markets: the Midnight REST API returns token addresses only.
  // The API answers for every (address, chain) pair, including "UNKNOWN" placeholders: match by pair and skip those.
  GetAssetsByAddress: gql`
    query GetAssetsByAddress($addresses: [String!], $chainIds: [Int!]) {
      assets(where: { address_in: $addresses, chainId_in: $chainIds }, first: 1000) {
        items {
          address
          symbol
          name
          decimals
          logoURI
          chain {
            id
          }
          price {
            usd
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
            marketId
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

// export const SubgraphRequests = {
//   // GetVaults: gql``,
//   // GetMarkets: gql``,
//   // GetVaultByAddress: gql``,
//   // GetMarketByAddress: gql``,
//   GetMetaMorphos: gql`
//     query GetMetaMorphos {
//       metaMorphos(first: 1000) {
//         id
//         name
//         symbol
//         asset {
//           id
//           name
//           symbol
//         }
//         timelock
//       }
//     }
//   `,
//   GetMetamorphoPositions: gql`
//     query GetMetamorphoPositions($account: String!) {
//       metaMorphoPositions(where: { account: $account }) {
//         id
//         lastAssetsBalance
//         lastAssetsBalanceUSD
//         metaMorpho {
//           id
//           name
//           asset {
//             symbol
//             name
//             decimals
//             id
//           }
//           curator {
//             id
//           }
//         }
//       }
//     }
//   `,
//   GetMorphoMarkets: gql`
//     query GetMorphoMarkets {
//       markets(first: 1000) {
//         maximumLTV
//         lltv
//         name
//         rates {
//           rate
//           side
//           type
//         }
//         id
//         irm
//         totalCollateral
//         totalSupply
//         totalSupplyShares
//         totalValueLockedUSD
//         isActive
//         borrowedToken {
//           name
//           symbol
//           id
//           decimals
//         }
//         inputToken {
//           decimals
//           id
//           name
//           symbol
//         }
//         totalBorrow
//       }
//     }
//   `,
//   GetMorphoMarketPositions: gql`
//     query GetMorphoMarketPositions($account: String!) {
//       account(id: $account) {
//         id
//         positionCount
//         openPositionCount
//         positions {
//           id
//           market {
//             id
//             name
//             inputToken {
//               id
//               name
//               symbol
//               decimals
//             }
//             borrowedToken {
//               id
//               decimals
//               name
//               symbol
//             }
//           }
//           asset {
//             id
//             symbol
//             name
//             decimals
//           }
//           side
//           isCollateral
//           balance
//           hashClosed
//           hashOpened
//         }
//       }
//     }
//   `
// };

// export const MorphoRequests = {
//   // GetVaultsApy: gql``,
//   // GetCuratorsData: gql``
// };
