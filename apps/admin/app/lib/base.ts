import { useLocation } from 'react-router';

/** '/figui' cuando el editor se abre desde Figui; '/app' dentro de Shopify. */
export function useBase(): '/app' | '/figui' {
  return useLocation().pathname.startsWith('/figui') ? '/figui' : '/app';
}

const KEY = 'cod-figui-token';

/** Token del editor (llega en ?ft= y se guarda para las peticiones siguientes). */
export function figuiToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = new URL(window.location.href).searchParams.get('ft');
  try {
    if (fromUrl) sessionStorage.setItem(KEY, fromUrl);
    return fromUrl || sessionStorage.getItem(KEY);
  } catch {
    return fromUrl;
  }
}

/** URL para abrir fuera de fetch (descargas): lleva el token. */
export function withFiguiToken(url: string): string {
  const t = figuiToken();
  if (!t) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ft=${encodeURIComponent(t)}`;
}

export type PickedResource = {
  id: string;
  title: string;
  images?: { originalSrc?: string; url?: string }[];
  variants?: { id: string; price?: string; title?: string }[];
};

type ShopifyGlobal = { resourcePicker?: (o: unknown) => Promise<unknown> };

/** Selector de productos/colecciones: el de Shopify o, desde Figui, el propio. */
export async function pickResources(opts: { type: 'product' | 'collection' }): Promise<PickedResource[] | undefined> {
  const w = window as unknown as { shopify?: ShopifyGlobal; __codPicker?: (o: { type: 'product' | 'collection' }) => Promise<PickedResource[] | undefined> };
  if (w.shopify?.resourcePicker && !window.location.pathname.startsWith('/figui')) {
    return (await w.shopify.resourcePicker({ type: opts.type, action: 'select', multiple: false })) as PickedResource[] | undefined;
  }
  return w.__codPicker?.(opts);
}
