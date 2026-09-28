import { generatePath, Navigate, useLocation, useParams } from 'react-router-dom';

// ==============================|| LEGACY REDIRECT ||============================== //

/**
 * Redirects an old URL to its new pattern, carrying route params, query (?chainId=) and hash.
 * `to` is a route pattern, e.g. "/variable/:marketId".
 */
export default function LegacyRedirect({ to }: { to: string }) {
  const params = useParams();
  const location = useLocation();

  return <Navigate to={{ pathname: generatePath(to, params), search: location.search, hash: location.hash }} replace />;
}
