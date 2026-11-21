import type { WidgetConfig, QuoteResponse, SubmitRequest, SubmitResponse, ReverseGeocodeResponse } from '@cod/contracts';

/**
 * Todo pasa por el App Proxy de Shopify (/apps/cod/*).
 * Ventaja: Shopify firma cada request con HMAC, así que el backend sabe de qué
 * tienda viene sin que nosotros expongamos tokens ni abramos CORS.
 */
/** Tiendas conectadas desde Figui: el cargador deja aquí la API y la clave. */
type Direct = { api: string; shop: string; k: string; floating?: boolean; cartButton?: boolean };
export const DIRECT = (globalThis as { __CODF__?: Direct }).__CODF__;
const BASE = DIRECT?.api ?? '/apps/cod';

/** Sin App Proxy, cada llamada lleva la tienda y su clave pública. */
function url(path: string): string {
  if (!DIRECT) return `${BASE}${path}`;
  const q = `shop=${encodeURIComponent(DIRECT.shop)}&k=${encodeURIComponent(DIRECT.k)}`;
  return `${BASE}${path}${path.includes('?') ? '&' : '?'}${q}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // Sin cabeceras propias en las lecturas, y en texto plano entre dominios: así
  // el navegador no hace la consulta previa de permiso (CORS) antes de cada
  // llamada, que en un móvil es un viaje de ida y vuelta más.
  const headers: Record<string, string> = init?.body == null ? {}
    : { 'Content-Type': DIRECT ? 'text/plain;charset=UTF-8' : 'application/json' };
  const res = await fetch(url(path), { ...init, headers: { ...headers, ...((init?.headers as Record<string, string>) ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Error de red' }));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Error');
  }
  return res.json() as Promise<T>;
}

/**
 * Formulario de cada producto: una sola petición aunque haya dos botones
 * (el de la página y el flotante). El cargador puede haberla adelantado
 * mientras se descargaba este código.
 */
const configs = new Map<string, Promise<WidgetConfig>>();
function loadConfig(productId: string, variantId: string): Promise<WidgetConfig> {
  const q = `productId=${encodeURIComponent(productId)}&variantId=${encodeURIComponent(variantId)}`;
  let p = configs.get(q);
  if (!p) {
    const pre = (DIRECT as (Direct & { pre?: Record<string, Promise<WidgetConfig>> }) | undefined)?.pre?.[q];
    const fresh = () => call<WidgetConfig>(`/form?${q}`);
    p = pre ? pre.then((c) => (c && (c as { formId?: string }).formId ? c : fresh()), fresh) : fresh();
    configs.set(q, p);
    // Si falla, el próximo intento vuelve a pedirlo.
    p.catch(() => configs.delete(q));
  }
  return p;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export const api = {
  config: (productId: string, variantId: string) => loadConfig(productId, variantId),

  quote: (body: { formId: string; variantId: string; qty: number; province?: string | null; discountCode?: string | null; addonIds?: string[]; cart?: { variantId: string; qty: number }[]; cartToken?: string; cartTotalCents?: number }) =>
    call<QuoteResponse>('/quote', { method: 'POST', body: JSON.stringify(body) }),

  /** La API key de Google no toca jamás el navegador. */
  reverse: (lat: number, lng: number) =>
    call<ReverseGeocodeResponse>('/geo/reverse', { method: 'POST', body: JSON.stringify({ lat, lng }) }),

  /**
   * Enviar el pedido. Si la conexión falla o el servidor está ocupado, se
   * reintenta solo (hasta 4 veces) con la MISMA clave: nunca se duplica y el
   * cliente no tiene que volver a pulsar.
   */
  submit: async (body: SubmitRequest) => {
    const waits = [600, 1500, 3000, 5000];
    for (let i = 0; ; i++) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 20000) : 0;
      try {
        return await call<SubmitResponse>('/submit', { method: 'POST', body: JSON.stringify(body), signal: ctl?.signal });
      } catch (e) {
        // Errores del pedido (datos, bloqueo…): se muestran. Red, tiempo o servidor caído: se reintenta.
        const retry = !(e instanceof ApiError) || e.status >= 500 || e.status === 429;
        if (!retry || i >= waits.length) throw e instanceof ApiError ? e : new ApiError(0, 'Sin conexión. Revisa tu internet e inténtalo de nuevo.');
        await new Promise((r) => setTimeout(r, waits[i]));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  },

  /** Enlace de «Estado del pedido» de Shopify (cuando el pedido ya está creado). */
  orderStatus: (submissionId: string, key: string) =>
    call<{ ready: boolean; url: string | null }>('/order-status', { method: 'POST', body: JSON.stringify({ submissionId, key }) }),

  /** Evento de embudo. sendBeacon no bloquea al cliente ni espera respuesta. */
  track: (formId: string, event: string, sessionId: string, field?: string | null) => {
    const body = JSON.stringify({ formId, event, sessionId, field: field ?? null, ts: Date.now() });
    try {
      if (navigator.sendBeacon) {
        // Entre dominios el beacon solo puede ir como text/plain (la API lo lee como JSON).
        const sent = DIRECT
          ? navigator.sendBeacon(url('/track'), new Blob([body], { type: 'text/plain' }))
          : navigator.sendBeacon(`${BASE}/track${location.search}`, new Blob([body], { type: 'application/json' }));
        if (sent) return;
      }
    } catch { /* cae al fetch */ }
    void fetch(url('/track'), { method: 'POST', headers: { 'Content-Type': DIRECT ? 'text/plain;charset=UTF-8' : 'application/json' }, body, keepalive: true });
  },
};

/* ── Carrito de la tienda (la API Ajax de Shopify, en el mismo dominio) ── */
export type ShopCartLine = { variantId: string; productId: string; qty: number };

const shopRoot = () => ((window as { Shopify?: { routes?: { root?: string } } }).Shopify?.routes?.root ?? '/').replace(/\/?$/, '/');

export async function readCart(): Promise<ShopCartLine[]> {
  return (await readCartFull()).lines;
}

/** El carrito con su token y su total (con los descuentos que le aplica la tienda). */
export async function readCartFull(): Promise<{ lines: ShopCartLine[]; token: string; totalCents: number }> {
  const res = await fetch(`${shopRoot()}cart.js`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('cart');
  const cart = (await res.json()) as { token?: string; total_price?: number; items?: { variant_id: number; product_id: number; quantity: number }[] };
  return { token: cart.token ?? '', totalCents: cart.total_price ?? 0, lines: (cart.items ?? []).filter((i) => i.quantity > 0).slice(0, 50).map((i) => ({
    variantId: `gid://shopify/ProductVariant/${i.variant_id}`,
    productId: `gid://shopify/Product/${i.product_id}`,
    qty: Math.min(i.quantity, 99),
  })) };
}

/** Tras pedir por el formulario, el carrito se vacía (si no, el cliente lo vería lleno). */
export function clearCart(): void {
  void fetch(`${shopRoot()}cart/clear.js`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(() => document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true })))
    .catch(() => undefined);
}
