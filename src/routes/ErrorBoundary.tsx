import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

// material-ui
import Alert from '@mui/material/Alert';

// third party
import { FormattedMessage } from 'react-intl';

// ==============================|| ELEMENT ERROR - COMMON ||============================== //

export default function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <Alert color="error">
          <FormattedMessage id="errors.e404" />
        </Alert>
      );
    }

    if (error.status === 401) {
      return (
        <Alert color="error">
          <FormattedMessage id="errors.e401" />
        </Alert>
      );
    }

    if (error.status === 503) {
      return (
        <Alert color="error">
          <FormattedMessage id="errors.e503" />
        </Alert>
      );
    }

    if (error.status === 418) {
      return (
        <Alert color="error">
          <FormattedMessage id="errors.e418" />
        </Alert>
      );
    }
  }

  return (
    <Alert color="error">
      <FormattedMessage id="errors.maintenance" />
    </Alert>
  );
}
