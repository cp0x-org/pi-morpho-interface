import { RouterProvider } from 'react-router-dom';
// import { ApolloProvider } from '@apollo/client';

// routing
import router from 'routes';

// project imports
import Locales from 'ui-component/Locales';
import NavigationScroll from 'layout/NavigationScroll';
// import RTLLayout from 'ui-component/RTLLayout';
import Snackbar from 'ui-component/extended/Snackbar';
import Notistack from 'ui-component/third-party/Notistack';

// Apollo client
// import apolloClients from './api/apollo-client';

import ThemeCustomization from 'themes';

// auth provider
import { JWTProvider as AuthProvider } from 'contexts/JWTContext';
import { DynamicApolloProvider } from '@/providers/DynamicApolloProvider';
// import { FirebaseProvider as AuthProvider } from 'contexts/FirebaseContext';
// import { Auth0Provider as AuthProvider } from 'contexts/Auth0Context';
// import { AWSCognitoProvider as AuthProvider } from 'contexts/AWSCognitoContext';
// import { SupabseProvider as AuthProvider } from 'contexts/SupabaseContext';

// ==============================|| APP ||============================== //

export default function App() {
  return (
    <ThemeCustomization>
      {/* <RTLLayout> */}
      <Locales>
        <NavigationScroll>
          <AuthProvider>
            <DynamicApolloProvider>
              <Notistack>
                <RouterProvider router={router} />
                <Snackbar />
              </Notistack>
            </DynamicApolloProvider>
          </AuthProvider>
        </NavigationScroll>
      </Locales>
      {/* </RTLLayout> */}
    </ThemeCustomization>
  );
}
