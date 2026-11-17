import { loaderUrl } from './figui.server';

/**
 * Pone (o quita) el formulario en el tema publicado de la tienda.
 *
 * Shopify ya no deja crear «script tags» (desde el 1-oct-2026) y las apps de
 * cada tienda (las que usa Figui) no pueden llevar extensión del tema. Lo que
 * sí pueden, con permiso write_themes, es editar el tema: se crea un snippet
 * propio y se añade UNA línea al final de layout/theme.liquid. Al apagarlo se
 * quitan los dos. Nada más del tema se toca.
 */

const SNIPPET_KEY = 'snippets/figui-cod-form.liquid';
const RENDER_LINE = "{% render 'figui-cod-form' %}";
const MARK = '{%- comment -%} Formulario COD (Figui) {%- endcomment -%}';
const API_VERSION = '2025-07';

export class ThemeAccessError extends Error {
  constructor(message: string, readonly missingScope = false) { super(message); }
}

async function rest<T>(domain: string, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.SHOPIFY_API_BASE_OVERRIDE || `https://${domain}`;
  const res = await fetch(`${base}/admin/api/${API_VERSION}/${path}`, {
    ...init,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) {
    throw new ThemeAccessError('Falta el permiso de temas (read_themes y write_themes) en la app de la tienda.', true);
  }
  if (res.status === 404) return null as T;
  if (!res.ok) throw new ThemeAccessError(`Shopify respondió ${res.status} al leer el tema.`);
  return (await res.json()) as T;
}

type Theme = { id: number; name: string; role: string };

export async function mainTheme(domain: string, token: string): Promise<Theme | null> {
  const r = await rest<{ themes: Theme[] } | null>(domain, token, 'themes.json?role=main');
  return r?.themes?.find((t) => t.role === 'main') ?? r?.themes?.[0] ?? null;
}

async function getAsset(domain: string, token: string, themeId: number, key: string): Promise<string | null> {
  const r = await rest<{ asset?: { value?: string } } | null>(
    domain, token, `themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
  );
  return r?.asset?.value ?? null;
}

async function putAsset(domain: string, token: string, themeId: number, key: string, value: string): Promise<void> {
  await rest(domain, token, `themes/${themeId}/assets.json`, { method: 'PUT', body: JSON.stringify({ asset: { key, value } }) });
}

async function deleteAsset(domain: string, token: string, themeId: number, key: string): Promise<void> {
  await rest(domain, token, `themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: 'DELETE' });
}

/** Lo que va en el snippet: los datos del producto de la página y el cargador. */
export function snippetContent(domain: string): string {
  return `${MARK}
{%- comment -%} Lo pone y lo quita Figui. No hace falta editarlo. {%- endcomment -%}
{%- if template contains 'product' and product -%}
  <div hidden data-cod-product
    data-product-id="gid://shopify/Product/{{ product.id }}"
    data-variant-id="gid://shopify/ProductVariant/{{ product.selected_or_first_available_variant.id }}"></div>
{%- endif -%}
<script src="${loaderUrl(domain)}" defer></script>
`;
}

/** Código para pegar a mano en un bloque «Liquid personalizado» (sitio exacto). */
export function manualSnippet(domain: string): string {
  return `<div data-cod-form data-product-id="{{ product.id }}" data-variant-id="{{ product.selected_or_first_available_variant.id }}"></div>
<script src="${loaderUrl(domain)}" defer></script>`;
}

export type ThemeStatus = { installed: boolean; themeName: string | null };

export async function themeStatus(domain: string, token: string): Promise<ThemeStatus> {
  const theme = await mainTheme(domain, token);
  if (!theme) return { installed: false, themeName: null };
  const layout = await getAsset(domain, token, theme.id, 'layout/theme.liquid');
  return { installed: !!layout && layout.includes(RENDER_LINE), themeName: theme.name };
}

export async function installInTheme(domain: string, token: string): Promise<ThemeStatus> {
  const theme = await mainTheme(domain, token);
  if (!theme) throw new ThemeAccessError('La tienda no tiene un tema publicado.');
  const layout = await getAsset(domain, token, theme.id, 'layout/theme.liquid');
  if (!layout) throw new ThemeAccessError('No se encontró layout/theme.liquid en el tema publicado.');
  // El snippet se reescribe siempre (por si cambió la dirección del cargador).
  await putAsset(domain, token, theme.id, SNIPPET_KEY, snippetContent(domain));
  if (!layout.includes(RENDER_LINE)) {
    const at = layout.lastIndexOf('</body>');
    const line = `  ${RENDER_LINE}\n`;
    const next = at >= 0 ? `${layout.slice(0, at)}${line}${layout.slice(at)}` : `${layout}\n${line}`;
    await putAsset(domain, token, theme.id, 'layout/theme.liquid', next);
  }
  return { installed: true, themeName: theme.name };
}

export async function removeFromTheme(domain: string, token: string): Promise<ThemeStatus> {
  const theme = await mainTheme(domain, token);
  if (!theme) return { installed: false, themeName: null };
  const layout = await getAsset(domain, token, theme.id, 'layout/theme.liquid');
  if (layout && layout.includes(RENDER_LINE)) {
    const next = layout.replace(new RegExp(`[ \\t]*${RENDER_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\n?`, 'g'), '');
    await putAsset(domain, token, theme.id, 'layout/theme.liquid', next);
  }
  await deleteAsset(domain, token, theme.id, SNIPPET_KEY).catch(() => undefined);
  return { installed: false, themeName: theme.name };
}
