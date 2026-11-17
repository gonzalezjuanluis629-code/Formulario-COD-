import type { WidgetConfig, QuoteResponse, SubmitRequest, SubmitResponse, ReverseGeocodeResponse } from '@cod/contracts';

/**
 * Todo pasa por el App Proxy de Shopify (/apps/cod/*).
 * Ventaja: Shopify firma cada request con HMAC, así que el backend sabe de qué
 * tienda viene sin que nosotros expongamos tokens ni abramos CORS.
 */
/** Tiendas conectadas desde Figui: el cargador deja aquí la API y la clave. */
type Direct = { api: string; shop: string; k: string };
const DIRECT = (globalThis as { __CODF__?: Direct }).__CODF__;
const BASE = DIRECT?.api ?? '/apps/cod';

/** Sin App Proxy, cada llamada lleva la tienda y su clave pública. */
function url(path: string): string {
  if (!DIRECT) return `${BASE}${path}`;
  const q = `shop=${encodeURIComponent(DIRECT.shop)}&k=${encodeURIComponent(DIRECT.k)}`;
  return `${BASE}${path}${path.includes('?') ? '&' : '?'}${q}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Error de red' }));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Error');
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export const api = {
  config: (productId: string, variantId: string) =>
    call<WidgetConfig>(`/form?productId=${encodeURIComponent(productId)}&variantId=${encodeURIComponent(variantId)}`),

  quote: (body: { formId: string; variantId: string; qty: number; province?: string | null; discountCode?: string | null; addonIds?: string[] }) =>
    call<QuoteResponse>('/quote', { method: 'POST', body: JSON.stringify(body) }),

  /** La API key de Google no toca jamás el navegador. */
  reverse: (lat: number, lng: number) =>
    call<ReverseGeocodeResponse>('/geo/reverse', { method: 'POST', body: JSON.stringify({ lat, lng }) }),

  submit: (body: SubmitRequest) =>
    call<SubmitResponse>('/submit', { method: 'POST', body: JSON.stringify(body) }),

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
    void fetch(url('/track'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  },
};
