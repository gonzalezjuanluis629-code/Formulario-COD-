import { FIGUI_API_VERSION, loaderUrl } from './figui.server';

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
const API_VERSION = FIGUI_API_VERSION;

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

async function allThemes(domain: string, token: string): Promise<Theme[]> {
  const r = await rest<{ themes: Theme[] } | null>(domain, token, 'themes.json');
  return r?.themes ?? [];
}

export async function mainTheme(domain: string, token: string): Promise<Theme | null> {
  return (await allThemes(domain, token)).find((t) => t.role === 'main') ?? null;
}

/** Una operación sobre el tema de una tienda a la vez (dos clics seguidos no se pisan). */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(domain: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(domain) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(domain, next);
  void next.finally(() => { if (locks.get(domain) === next) locks.delete(domain); }).catch(() => undefined);
  return next;
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

/**
 * Código para pegar a mano en un bloque «Liquid personalizado» (sitio exacto).
 * Por defecto el BOTÓN «Comprar ahora» que abre el formulario; también el
 * formulario completo, para quien lo quiera a la vista.
 */
export function manualSnippet(domain: string, mode: 'popup' | 'embedded' = 'popup'): string {
  return `<div data-cod-form data-mode="${mode}" data-product-id="{{ product.id }}" data-variant-id="{{ product.selected_or_first_available_variant.id }}"></div>
<script src="${loaderUrl(domain)}" defer></script>`;
}

export type ThemeStatus = { installed: boolean; themeName: string | null };

export async function themeStatus(domain: string, token: string): Promise<ThemeStatus> {
  const theme = await mainTheme(domain, token);
  if (!theme) return { installed: false, themeName: null };
  const layout = await getAsset(domain, token, theme.id, 'layout/theme.liquid');
  // Activo de verdad = la línea Y el snippet (sin snippet el tema daría error).
  const installed = !!layout && layout.includes(RENDER_LINE) && (await getAsset(domain, token, theme.id, SNIPPET_KEY)) !== null;
  return { installed, themeName: theme.name };
}

export function installInTheme(domain: string, token: string): Promise<ThemeStatus> {
  return withLock(domain, () => doInstall(domain, token));
}

async function doInstall(domain: string, token: string): Promise<ThemeStatus> {
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

/** Quita la línea y el snippet de TODOS los temas (por si la tienda cambió de tema). */
export function removeFromTheme(domain: string, token: string): Promise<ThemeStatus> {
  return withLock(domain, () => doRemove(domain, token));
}

const RENDER_RE = new RegExp(`[ \\t]*${RENDER_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\n?`, 'g');

async function doRemove(domain: string, token: string): Promise<ThemeStatus> {
  const themes = await allThemes(domain, token);
  for (const theme of themes) {
    const layout = await getAsset(domain, token, theme.id, 'layout/theme.liquid');
    if (layout && layout.includes(RENDER_LINE)) {
      // Primero la línea y luego el snippet: nunca queda una línea sin su snippet.
      await putAsset(domain, token, theme.id, 'layout/theme.liquid', layout.replace(RENDER_RE, ''));
    }
    if (layout !== null) await deleteAsset(domain, token, theme.id, SNIPPET_KEY).catch(() => undefined);
  }
  return { installed: false, themeName: themes.find((t) => t.role === 'main')?.name ?? null };
}
