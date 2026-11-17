import type { Request } from 'express';

/**
 * IP real del cliente detrás de los proxies.
 *
 * Sin esto, req.ip es la IP del borde de Railway: todos los clientes de una
 * tienda parecían la misma persona y el límite anti-abuso bloqueaba pedidos
 * legítimos. X-Forwarded-For se lee DESDE LA DERECHA (lo que añadió nuestra
 * infraestructura), nunca la primera entrada, que el navegador puede inventar:
 *   - Directo (tiendas de Figui): cliente → Railway       → última entrada.
 *   - App Proxy de Shopify:       cliente → Shopify → Railway → penúltima.
 */
export function clientIp(req: Request): string {
  const chain = String(req.headers['x-forwarded-for'] ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const viaProxy = typeof req.query.signature === 'string';
  const hop = viaProxy ? chain[chain.length - 2] : chain[chain.length - 1];
  return hop || req.socket.remoteAddress || '0.0.0.0';
}
