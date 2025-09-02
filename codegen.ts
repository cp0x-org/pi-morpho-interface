import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  generates: {
    'src/generated/morpho.ts': {
      schema: 'https://api.morpho.org/graphql',
      documents: 'src/api/morpho-queries.ts',
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-apollo',
      ],
      config: {
        withHooks: true,
      },
    },
    'src/generated/subgraph.ts': {
      schema: 'https://gateway.thegraph.com/api/ae52646e3d3487806a739c9a253a358d/subgraphs/id/8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
      documents: 'src/api/subgraph-queries.ts',
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-apollo',
      ],
      config: {
        withHooks: true,
      },
    },
  },
};

export default config;