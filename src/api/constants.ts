import { gql } from '@apollo/client';

export const ApiUrls = {
  morphoApi: 'https://api.morpho.org/graphql',
  ethGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
  baseGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/71ZTy1veF9twER9CLMnPWeLQ7GZcwKsjmygejrgKirqs',
  polygonGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/EhFokmwryNs7qbvostceRqVdjc3petuD13mmdUiMBw8Y',
  unichainGraphApi:
    'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/ESbNRVHte3nwhcHveux9cK4FFAZK3TTLc5mKQNtpYgmu'
};

export const OldRequests = {
  //EarnPage
  GetMorphoVaults: gql`
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
          state {
            dailyNetApy
            curator
            curators {
              name
              state {
                curatorId
              }
              id
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
  `
};

export const MorphoRequests = {
  // GetVaultsApy: gql``,
  // GetCuratorsData: gql``
};
