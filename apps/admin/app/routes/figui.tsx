import { useEffect, type ReactNode } from 'react';
import { AppProvider as PolarisAppProvider } from '@shopify/polaris';
import esTranslations from '@shopify/polaris/locales/es.json';
import { Link, NavLink, Outlet, isRouteErrorResponse, useLoaderData, useLocation, useRouteError } from 'react-router';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { requireShop } from '../lib/shop.server';
import { figuiToken, saveFiguiToken } from '../lib/base';
import { ResourcePickerHost } from '../components/ResourcePickerHost';

/**
 * El editor del formulario abierto DENTRO de Figui (iframe).
 * Sin Shopify App Bridge: la sesión es el token firmado que entrega Figui
 * (?ft= en la primera carga y cabecera X-Figui-Token en cada petición).
 */

// Antes de que React Router pida datos: toda petición al propio servidor lleva el token.
if (typeof window !== 'undefined' && !(window as unknown as { __codFetch?: boolean }).__codFetch) {
  (window as unknown as { __codFetch?: boolean }).__codFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = figuiToken();
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let sameOrigin = false;
    try { sameOrigin = new URL(raw, window.location.href).origin === window.location.origin; } catch { /* URL rara: no se toca */ }
    if (!token || !sameOrigin) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('X-Figui-Token', token);
    return original(input, { ...init, headers });
  };
  // El enlace trae un token corto (minutos): se cambia por la sesión de trabajo,
  // que solo viaja en cabeceras (nunca en URLs ni registros).
  const boot = new URL(window.location.href).searchParams.get('ft');
  if (boot) {
    saveFiguiToken(boot);
    void original('/figui-api/session', { method: 'POST', headers: { 'X-Figui-Token': boot } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { token?: string } | null) => { if (d?.token) saveFiguiToken(d.token); })
      .catch(() => undefined);
  }
}

export const links = () => [{ rel: 'stylesheet', href: polarisStyles }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  return { shopName: shop.name ?? shop.domain };
}

/** Solo Figui puede mostrar el editor dentro de su página. */
export const headers: HeadersFunction = () => {
  const allowed = (process.env.FIGUI_APP_URL ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return {
    'Content-Security-Policy': `frame-ancestors 'self' ${allowed.join(' ')}`.trim(),
    'Cache-Control': 'no-store',
  };
};

// Los enlaces de Polaris navegan sin recargar (así la sesión no se pierde).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PolarisLink({ url, children, external, ...rest }: { url: string; children?: ReactNode; external?: boolean; [key: string]: any }) {
  if (external || /^https?:/.test(url)) return <a href={url} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
  return <Link to={url} {...rest}>{children}</Link>;
}

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/figui/facil', label: '✏️ Editar fácil' },
  { to: '/figui?lista=1', label: 'Opciones avanzadas', end: true },
  { to: '/figui/offers', label: 'Ofertas y descuentos' },
  { to: '/figui/shipping', label: 'Envíos' },
  { to: '/figui/orders', label: 'Pedidos del formulario' },
  { to: '/figui/analytics', label: 'Analítica' },
  { to: '/figui/antifraud', label: 'Lista de bloqueo' },
  { to: '/figui/settings', label: 'Ajustes' },
];

export default function FiguiLayout() {
  useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  // Quita el token de la barra de direcciones (no queda en el historial).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('ft')) {
      url.searchParams.delete('ft');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);
  return (
    <PolarisAppProvider i18n={esTranslations} linkComponent={PolarisLink}>
      <style>{CSS}</style>
      <nav className="cod-fnav" aria-label="Secciones del formulario">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `cod-fnav-item${isActive || (n.end && pathname.startsWith('/figui/forms')) ? ' on' : ''}`}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
      <ResourcePickerHost />
    </PolarisAppProvider>
  );
}

const CSS = `
  .cod-fnav{display:flex;gap:4px;overflow-x:auto;padding:8px 12px;background:#fff;border-bottom:1px solid #e3e3e3;position:sticky;top:0;z-index:20;scrollbar-width:none}
  .cod-fnav::-webkit-scrollbar{display:none}
  .cod-fnav-item{flex:none;padding:7px 12px;border-radius:8px;font:500 13px/1.2 Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#303030;text-decoration:none;white-space:nowrap}
  .cod-fnav-item:hover{background:#f1f1f1}
  .cod-fnav-item.on{background:#303030;color:#fff}
`;

export function ErrorBoundary() {
  const error = useRouteError();
  const expired = isRouteErrorResponse(error) && error.status === 401;
  useEffect(() => {
    // Figui vuelve a abrir el editor con una sesión nueva.
    if (expired && window.parent !== window) window.parent.postMessage({ type: 'cod:need-token' }, '*');
  }, [expired]);
  const message = isRouteErrorResponse(error)
    ? String(error.data || 'No se pudo abrir el formulario.')
    : 'Algo salió mal al abrir el formulario. Recarga la página.';
  return (
    <div style={{ padding: 32, fontFamily: 'Inter, -apple-system, sans-serif', color: '#303030', textAlign: 'center' }}>
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{expired ? 'Reconectando…' : 'No se pudo abrir el formulario'}</p>
      <p style={{ color: '#616161', fontSize: 14 }}>{message}</p>
    </div>
  );
}
