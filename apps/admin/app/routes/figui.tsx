import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppProvider as PolarisAppProvider } from '@shopify/polaris';
import esTranslations from '@shopify/polaris/locales/es.json';
import { Link, Outlet, isRouteErrorResponse, useLoaderData, useLocation, useRouteError } from 'react-router';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { requireShop } from '../lib/shop.server';
import { figuiToken, saveFiguiToken } from '../lib/base';
import { ResourcePickerHost } from '../components/ResourcePickerHost';
import {
  EditIcon, DiscountIcon, DeliveryIcon, PaintBrushFlatIcon, OrderIcon, ChartVerticalIcon, ShieldCheckMarkIcon, SettingsIcon, AdjustIcon,
} from '@shopify/polaris-icons';

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

type Ico = typeof EditIcon;

/** Todas las secciones a la vista, como las pestañas de una página de Facebook. */
const NAV: { to: string; label: string; icon: Ico; match: (p: string, q: string) => boolean }[] = [
  { to: '/figui/facil', label: 'Editar fácil', icon: EditIcon, match: (p) => p.startsWith('/figui/facil') },
  { to: '/figui/offers', label: 'Ofertas y descuentos', icon: DiscountIcon, match: (p) => p.startsWith('/figui/offers') },
  { to: '/figui/shipping', label: 'Envíos', icon: DeliveryIcon, match: (p) => p.startsWith('/figui/shipping') },
  { to: '/figui/design', label: 'Diseño', icon: PaintBrushFlatIcon, match: (p, q) => p.startsWith('/figui/design') || (p.startsWith('/figui/forms') && q.includes('tab=design')) },
  { to: '/figui/orders', label: 'Pedidos', icon: OrderIcon, match: (p) => p.startsWith('/figui/orders') },
  { to: '/figui/analytics', label: 'Analítica', icon: ChartVerticalIcon, match: (p) => p.startsWith('/figui/analytics') },
  { to: '/figui/antifraud', label: 'Bloqueos', icon: ShieldCheckMarkIcon, match: (p) => p.startsWith('/figui/antifraud') },
  { to: '/figui/settings', label: 'Ajustes', icon: SettingsIcon, match: (p) => p.startsWith('/figui/settings') },
  { to: '/figui?lista=1', label: 'Opciones avanzadas', icon: AdjustIcon,
    match: (p, q) => (p.startsWith('/figui/forms') && !q.includes('tab=design')) || (/^\/figui\/?$/.test(p) && q.includes('lista=1')) },
];

/** Barra de pestañas: icono + nombre, raya azul que se desliza a la pestaña elegida. */
function TabBar() {
  const { pathname, search } = useLocation();
  const bar = useRef<HTMLElement>(null);
  const [ink, setInk] = useState<{ left: number; width: number } | null>(null);
  const active = NAV.findIndex((n) => n.match(pathname, search));
  useLayoutEffect(() => {
    const place = () => {
      const el = bar.current?.querySelector<HTMLElement>('.cod-tab.on');
      setInk(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    place();
    bar.current?.querySelector<HTMLElement>('.cod-tab.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active]);
  return (
    <div className="cod-tabs-wrap">
      <nav ref={bar} className="cod-tabs" aria-label="Secciones del formulario">
        {NAV.map((n, i) => {
          const I = n.icon;
          return (
            <Link key={n.to} to={n.to} className={`cod-tab${i === active ? ' on' : ''}`} aria-current={i === active ? 'page' : undefined}>
              <I className="cod-tab-ic" width={20} height={20} aria-hidden focusable="false" />
              <span>{n.label}</span>
            </Link>
          );
        })}
        {ink && <span className="cod-tab-ink" style={{ transform: `translateX(${ink.left}px)`, width: ink.width }} aria-hidden />}
      </nav>
    </div>
  );
}

export default function FiguiLayout() {
  useLoaderData<typeof loader>();
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
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <TabBar />
      <Outlet />
      <ResourcePickerHost />
    </PolarisAppProvider>
  );
}

const CSS = `
  .cod-tabs-wrap{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #E4E6EB;box-shadow:0 1px 2px rgba(0,0,0,.06),0 4px 12px -8px rgba(16,24,40,.12)}
  .cod-tabs{position:relative;display:flex;gap:2px;overflow-x:auto;padding:0 12px;scrollbar-width:none;
    -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 12px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 12px),transparent 100%)}
  .cod-tabs::-webkit-scrollbar{display:none}
  .cod-tab{position:relative;flex:none;display:flex;align-items:center;gap:8px;height:56px;padding:0 12px;color:#65676B;text-decoration:none;
    font:600 15px/1 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;-webkit-tap-highlight-color:transparent}
  .cod-tab::before{content:"";position:absolute;inset:6px 0;border-radius:8px;background:#F0F2F5;opacity:0;transform:scale(.94);transition:opacity .15s ease,transform .15s ease;z-index:-1}
  .cod-tab:hover::before{opacity:1;transform:scale(1)}
  .cod-tab:active::before{background:#E4E6EB}
  .cod-tab-ic{width:20px;height:20px;fill:currentColor;flex:none;transition:transform .2s ease}
  .cod-tab:hover .cod-tab-ic{transform:translateY(-1px)}
  .cod-tab.on{color:#1A73E8}
  .cod-tab.on::before{opacity:0}
  .cod-tab-ink{position:absolute;left:0;bottom:0;height:3px;border-radius:3px 3px 0 0;background:#1A73E8;box-shadow:0 -2px 8px rgba(26,115,232,.35);
    transition:transform .3s cubic-bezier(.2,.8,.2,1),width .3s cubic-bezier(.2,.8,.2,1)}
  .cod-tabs{isolation:isolate}
  @media (min-width:1300px){.cod-tabs{justify-content:center}}
  @media (max-width:700px){
    .cod-tab{flex-direction:column;justify-content:center;gap:4px;height:60px;padding:0 12px;font-size:12px}
    .cod-tab-ic{width:22px;height:22px}
  }
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
