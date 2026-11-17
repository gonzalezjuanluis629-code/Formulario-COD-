import type { Config } from '@react-router/dev/config';

/**
 * Railway termina el HTTPS y entrega la petición al servidor como HTTP. React
 * Router compara el `Origin` (https://…) con la URL de la petición (http://…),
 * no coinciden y rechazaba TODAS las acciones (guardar, publicar…) con 400.
 * Se declaran los dominios propios del panel. Las acciones siguen exigiendo
 * además el token de sesión de Shopify.
 */
const appHost = (() => {
  try { return process.env.SHOPIFY_APP_URL ? new URL(process.env.SHOPIFY_APP_URL).host : null; } catch { return null; }
})();

export default {
  ssr: true,
  allowedActionOrigins: [
    'admin-production-d33e.up.railway.app',
    ...(appHost ? [appHost] : []),
  ],
} satisfies Config;
