import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation } from 'react-router';

export function loader() {
  return { apiKey: process.env.SHOPIFY_API_KEY ?? '' };
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  // Desde Figui el editor va fuera de Shopify: sin App Bridge.
  const inShopify = !useLocation().pathname.startsWith('/figui');

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {inShopify && <meta name="shopify-api-key" content={apiKey} />}
        {inShopify && <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />}
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
