import type { LoaderFunctionArgs } from 'react-router';
import { authenticate, provisionShop } from '../shopify.server';
import { db } from '../db.server';

/**
 * TODA consulta del admin pasa por aquí. Devuelve el shopId del token de sesión,
 * nunca de un parámetro de la URL: así es imposible que una tienda lea los datos
 * de otra manipulando la query string.
 */
export async function requireShop(request: LoaderFunctionArgs['request']) {
  const { session, admin } = await authenticate.admin(request);
  let shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop || shop.uninstalledAt || !shop.accessTokenEnc.length) {
    // Primera vez (o instalación anterior a este servidor): se registra ahora.
    await provisionShop(session, admin);
    shop = await db.shop.findUniqueOrThrow({ where: { domain: session.shop } });
  }
  return { shop, admin, session };
}
