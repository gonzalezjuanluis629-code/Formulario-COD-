import { AppProvider } from '@shopify/shopify-app-react-router/react';
import { NavMenu } from '@shopify/app-bridge-react';
import { AppProvider as PolarisAppProvider } from '@shopify/polaris';
import esTranslations from '@shopify/polaris/locales/es.json';
import { Outlet, useLoaderData, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { authenticate } from '../shopify.server';

export const links = () => [{ rel: 'stylesheet', href: polarisStyles }];

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY ?? '' };
}

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider i18n={esTranslations}>
        <NavMenu>
          <a href="/app" rel="home">Inicio</a>
          <a href="/app/forms">Formularios</a>
          <a href="/app/design">Diseño</a>
          <a href="/app/offers">Ofertas y descuentos</a>
          <a href="/app/shipping">Envíos</a>
          <a href="/app/orders">Pedidos</a>
          <a href="/app/analytics">Analítica</a>
          <a href="/app/antifraud">Lista de bloqueo</a>
          <a href="/app/settings">Ajustes</a>
        </NavMenu>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
