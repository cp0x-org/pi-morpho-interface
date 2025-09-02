import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { ApiUrls } from './constants';

// const httpLink = new HttpLink({
//   uri: 'https://api.morpho.org/graphql'
// });
//
// const client = new ApolloClient({
//   link: httpLink,
//   cache: new InMemoryCache()
// });

export const appoloClients = {
  morphoApi: new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: ApiUrls.morphoApi })
  }),
  ethGraphApi: new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: ApiUrls.ethGraphApi
    })
  }),
  baseGraphApi: new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: ApiUrls.baseGraphApi
    })
  }),
  polygonGraphApi: new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: ApiUrls.polygonGraphApi
    })
  }),
  unichainGraphApi: new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: ApiUrls.unichainGraphApi
    })
  })
};
