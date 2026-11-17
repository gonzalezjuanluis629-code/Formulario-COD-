import { useLocation } from 'react-router';

/** '/figui' cuando el editor se abre desde Figui; '/app' dentro de Shopify. */
export function useBase(): '/app' | '/figui' {
  return useLocation().pathname.startsWith('/figui') ? '/figui' : '/app';
}

const KEY = 'cod-figui-token';
let memoryToken: string | null = null;

/** Token del editor (llega en ?ft= al abrirlo y luego se cambia por la sesión). */
export function figuiToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return saved;
  } catch { /* almacenamiento bloqueado: se usa la memoria */ }
  return memoryToken ?? new URL(window.location.href).searchParams.get('ft');
}

export function saveFiguiToken(token: string): void {
  memoryToken = token;
  try { sessionStorage.setItem(KEY, token); } catch { /* solo en memoria */ }
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
