import { AppProvider } from '@shopify/shopify-app-react-router/react';
import { NavMenu } from '@shopify/app-bridge-react';
import { AppProvider as PolarisAppProvider } from '@shopify/polaris';
import esTranslations from '@shopify/polaris/locales/es.json';
import { Link, Outlet, useLoaderData, useRouteError } from 'react-router';
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
          <Link to="/app" rel="home">Inicio</Link>
          <Link to="/app/forms">Formularios</Link>
          <Link to="/app/design">Diseño</Link>
          <Link to="/app/offers">Ofertas y descuentos</Link>
          <Link to="/app/shipping">Envíos</Link>
          <Link to="/app/orders">Pedidos</Link>
          <Link to="/app/analytics">Analítica</Link>
          <Link to="/app/antifraud">Lista de bloqueo</Link>
          <Link to="/app/settings">Ajustes</Link>
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
