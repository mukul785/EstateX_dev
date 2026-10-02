export const getQueryString = (queryParamsObj: object | null) => {
  if (!queryParamsObj) return '';

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParamsObj)) {
    if (value) {
      params.append(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
};
