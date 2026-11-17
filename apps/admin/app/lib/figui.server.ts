import * as crypto from 'node:crypto';
import { db } from '../db.server';

/**
 * Integración con Figui (gestor de pedidos). Figui ya está conectado a la
 * tienda de Shopify y nos pasa su acceso; el comerciante edita el formulario
 * desde Figui (este admin en un iframe) sin instalar ninguna app extra.
 *
 * Todo va firmado con FIGUI_COD_SECRET (compartido solo entre los dos
 * servidores): tokens JWT HS256 cortos.
 *   - aud "cod-server": llamadas servidor→servidor (conectar, estado, activar).
 *   - aud "cod-editor": abrir el editor en el iframe (lleva la tienda).
 */

export type FiguiClaims = { shop: string; aud: string; exp: number; sub?: string };

const b64url = (b: Buffer) => b.toString('base64url');

function secret(): Buffer | null {
  const s = process.env.FIGUI_COD_SECRET;
  return s && s.length >= 32 ? Buffer.from(s) : null;
}

export function figuiEnabled(): boolean {
  return secret() !== null;
}

/** Verifica un JWT HS256 de Figui. Devuelve null si no vale (firma, audiencia o caducidad). */
export function verifyFiguiToken(token: string | null | undefined, aud: 'cod-server' | 'cod-editor'): FiguiClaims | null {
  const key = secret();
  if (!key || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = crypto.createHmac('sha256', key).update(`${h}.${p}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null;
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Partial<FiguiClaims> & { aud?: string | string[] };
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(aud)) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    if (typeof claims.shop !== 'string' || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(claims.shop)) return null;
    return { shop: claims.shop, aud, exp: claims.exp, sub: claims.sub };
  } catch {
    return null;
  }
}

/** Firma un token igual que Figui (renovar la sesión del editor y pruebas). */
export function signFiguiToken(claims: Omit<FiguiClaims, 'exp'> & { ttlSec?: number }): string {
  const key = secret();
  if (!key) throw new Error('Falta FIGUI_COD_SECRET');
  const h = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const { ttlSec = 300, ...rest } = claims;
  const p = b64url(Buffer.from(JSON.stringify({ ...rest, exp: Math.floor(Date.now() / 1000) + ttlSec })));
  const s = b64url(crypto.createHmac('sha256', key).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}

/** Token del editor: cabecera X-Figui-Token (fetch) o ?ft= (primera carga). */
export function editorTokenFrom(request: Request): string | null {
  return request.headers.get('x-figui-token') || new URL(request.url).searchParams.get('ft');
}

/** Rutas del editor dentro de Figui. */
export function isFiguiPath(request: Request): boolean {
  return new URL(request.url).pathname.startsWith('/figui');
}

/** Base de las rutas según desde dónde se abre el editor. */
export function basePath(request: Request): '/app' | '/figui' {
  return isFiguiPath(request) ? '/figui' : '/app';
}

/** Clave pública de la tienda para el widget sin App Proxy. Misma derivación que la API. */
export function storefrontKey(domain: string): string {
  const master = Buffer.from(process.env.MASTER_ENCRYPTION_KEY ?? '', 'base64');
  return crypto.createHmac('sha256', master).update(`cod-storefront:${domain.toLowerCase()}`).digest('base64url').slice(0, 32);
}

/** Dirección pública de la API (donde viven el cargador y el widget). */
export function apiBaseUrl(): string {
  return (process.env.COD_API_URL || 'https://api-production-e421.up.railway.app').replace(/\/+$/, '');
}

export function loaderUrl(domain: string): string {
  return `${apiBaseUrl()}/storefront/loader.js?shop=${encodeURIComponent(domain)}&k=${storefrontKey(domain)}`;
}

/* ─────────────── Shopify con el token que llega de Figui ─────────────── */

export const FIGUI_API_VERSION = '2026-07';
const API_VERSION = FIGUI_API_VERSION;

export class ShopifyCallError extends Error {
  constructor(message: string, readonly status: number, readonly accessDenied = false) { super(message); }
}

export async function shopifyGraphql<T>(domain: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  // Pruebas locales: la tienda simulada vive en localhost.
  const base = process.env.SHOPIFY_API_BASE_OVERRIDE || `https://${domain}`;
  const res = await fetch(`${base}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] | string };
  if (!res.ok) throw new ShopifyCallError(`Shopify respondió ${res.status}`, res.status, res.status === 401 || res.status === 403);
  if (body.errors) {
    const list = Array.isArray(body.errors) ? body.errors : [{ message: String(body.errors) }];
    const denied = list.some((e) => e.extensions?.code === 'ACCESS_DENIED' || /access denied|scope/i.test(e.message ?? ''));
    throw new ShopifyCallError(list.map((e) => e.message).join(' | ') || 'Error de Shopify', 200, denied);
  }
  return body.data as T;
}

/** Token de Shopify guardado de la tienda (para llamadas desde el editor en Figui). */
export async function shopToken(shopId: string, enc: Uint8Array): Promise<string> {
  const { decryptForShop } = await import('./crypto.server');
  return decryptForShop(shopId, Buffer.from(enc));
}

/** App «virtual» a la que se cuelgan las tiendas que llegan desde Figui. */
export async function figuiApp() {
  const { encryptForShop } = await import('./crypto.server');
  const existing = await db.shopifyApp.findUnique({ where: { handle: 'figui' } });
  if (existing) return existing;
  const created = await db.shopifyApp.create({
    data: {
      handle: 'figui',
      clientId: 'figui-managed',
      clientSecretEnc: Buffer.alloc(0),
      scopes: '',
    },
  }).catch(() => db.shopifyApp.findUniqueOrThrow({ where: { handle: 'figui' } }));
  if (!created.clientSecretEnc.length) {
    // Sin App Proxy no se usa, pero el resto del sistema espera poder descifrarlo.
    await db.shopifyApp.update({
      where: { id: created.id },
      data: { clientSecretEnc: encryptForShop(`app:${created.id}`, crypto.randomBytes(32).toString('hex')) },
    });
  }
  return created;
}
