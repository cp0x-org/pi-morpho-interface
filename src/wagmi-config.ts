// import { http, createConfig } from 'wagmi'
// import { mainnet, sepolia, Chain } from 'wagmi/chains';
import { mainnet, base, polygon, unichain, Chain } from 'wagmi/chains';
// import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http } from '@wagmi/core';
import { mainnet as mainnetCore } from '@wagmi/core/chains';

// import { Chain } from 'wagmi'

const mainTest: Chain = {
  id: 1999999,
  name: 'MyNet',
  nativeCurrency: {
    name: 'MainToken',
    symbol: 'MTK',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://virtual.mainnet.rpc.tenderly.co/f6a7b5d3-e340-4d72-a6ec-e4984cde3422']
    },
    public: {
      http: ['https://virtual.mainnet.rpc.tenderly.co/f6a7b5d3-e340-4d72-a6ec-e4984cde3422']
    }
  },
  blockExplorers: {
    default: {
      name: 'Tenderly Explorer',
      url: 'https://dashboard.tenderly.co/'
    }
  },
  testnet: false // или true, если это тестовая сеть
};

const mainAnvil: Chain = {
  id: 1222,
  name: 'Anvil',
  nativeCurrency: {
    name: 'aEth',
    symbol: 'MTK',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545']
    },
    public: {
      http: ['http://127.0.0.1:8545']
    }
  },
  blockExplorers: {
    default: {
      name: 'None',
      url: ''
    }
  },
  testnet: false
};

const mainnetCustom = {
  ...mainnet,
  rpcUrls: {
    default: { http: ['https://mainnet.gateway.tenderly.co/pdi7AAywqnL5vR9UcNZag'] }
    // public: { http: ['https://mainnet.gateway.tenderly.co/pdi7AAywqnL5vR9UcNZag'] }
  }
};

const baseCustom = {
  ...base,
  rpcUrls: {
    default: { http: ['https://base.gateway.tenderly.co/4ZBIIWD6nHhRpKjsjBbW76'] }
    // public: { http: ['https://base.gateway.tenderly.co/4ZBIIWD6nHhRpKjsjBbW76'] }
  }
};

const polygonCustom = {
  ...polygon,
  rpcUrls: {
    default: { http: ['https://polygon-mainnet.infura.io/v3/b685c66673a84c0dbd363bc4524c2e73'] }
    // public: { http: ['https://polygon-mainnet.infura.io/v3/b685c66673a84c0dbd363bc4524c2e73'] }
  }
};

export const config = getDefaultConfig({
  appName: 'Morpho Interface',
  projectId: '3bd0ad741725d54fbc9a4c7b6545720e',
  // chains: [mainnet, sepolia, mainTest],
  chains: [mainnetCustom, baseCustom, polygonCustom],
  // chains: [mainnet, mainAnvil, mainTest],
  ssr: false
});
