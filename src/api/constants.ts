/** Same-origin REST proxy. The container adds the optional private API key server-side. */
export const ApiUrls = {
  morphoApi: '/morpho-api',
  midnightApi: '/morpho-api/v0/midnight'
};

export const getMidnightApiBaseUrl = () => new URL(ApiUrls.midnightApi, window.location.origin).toString().replace(/\/$/, '');
