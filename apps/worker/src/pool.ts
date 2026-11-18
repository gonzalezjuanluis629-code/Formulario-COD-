/**
 * Tamaño del grupo de conexiones a la base de datos, sin tocar la variable
 * DATABASE_URL: si ya trae connection_limit, se respeta.
 */
export function withPool(url: string | undefined, limit: number): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}&pool_timeout=20`;
}
