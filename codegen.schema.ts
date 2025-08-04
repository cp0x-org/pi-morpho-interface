import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  generates: {
    // Схема для Morpho API
    'schema-morpho.graphql': {
      schema: 'https://api.morpho.org/graphql',
      plugins: ['schema-ast'],
    },
    // Схема для Subgraph API (используем Ethereum, измените при необходимости)
    'schema-subgraph.graphql': {
      schema: 'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
      plugins: ['schema-ast'],
    },
  },
};

export default config;
