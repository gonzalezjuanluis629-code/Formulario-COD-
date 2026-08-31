import type { WidgetConfig, QuoteResponse, SubmitRequest, SubmitResponse, ReverseGeocodeResponse } from '@cod/contracts';

/**
 * Todo pasa por el App Proxy de Shopify (/apps/cod/*).
 * Ventaja: Shopify firma cada request con HMAC, así que el backend sabe de qué
 * tienda viene sin que nosotros expongamos tokens ni abramos CORS.
 */
const BASE = '/apps/cod';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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

  quote: (body: { formId: string; variantId: string; qty: number; province?: string | null; discountCode?: string | null }) =>
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
        navigator.sendBeacon(`${BASE}/track${location.search}`, new Blob([body], { type: 'application/json' }));
        return;
      }
    } catch { /* cae al fetch */ }
    void fetch(`${BASE}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  },
};
