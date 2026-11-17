import * as crypto from 'node:crypto';

/**
 * Clave pública de la tienda para el widget cuando NO pasa por el App Proxy de
 * Shopify (tiendas conectadas desde Figui). No es secreta (va en la página),
 * pero impide usar la API con una tienda inventada: solo quien la recibió del
 * servidor puede usarla. Misma derivación en el admin.
 */
export function storefrontKey(domain: string): string {
  const master = Buffer.from(process.env.MASTER_ENCRYPTION_KEY ?? '', 'base64');
  return crypto.createHmac('sha256', master).update(`cod-storefront:${domain.toLowerCase()}`).digest('base64url').slice(0, 32);
}

export function isValidStorefrontKey(domain: string, key: string): boolean {
  const a = Buffer.from(storefrontKey(domain));
  const b = Buffer.from(String(key ?? ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
