import type { LoaderFunctionArgs } from 'react-router';
import { authenticate, provisionShop } from '../shopify.server';
import { db } from '../db.server';
import { editorTokenFrom, isFiguiPath, verifyFiguiToken } from './figui.server';

/**
 * TODA consulta del admin pasa por aquí. Devuelve el shopId del token de sesión,
 * nunca de un parámetro de la URL: así es imposible que una tienda lea los datos
 * de otra manipulando la query string.
 *
 * Desde Figui (/figui/*) el token es el JWT firmado que entrega Figui para ESA tienda.
 */
export async function requireShop(request: LoaderFunctionArgs['request']) {
  if (isFiguiPath(request)) {
    const claims = verifyFiguiToken(editorTokenFrom(request), 'cod-editor');
    if (!claims) throw new Response('La sesión caducó. Vuelve a abrir el formulario desde Figui.', { status: 401 });
    const shop = await db.shop.findUnique({ where: { domain: claims.shop } });
    if (!shop || shop.uninstalledAt) throw new Response('Esta tienda no está conectada al formulario.', { status: 404 });
    return { shop, admin: null, session: null };
  }

  const { session, admin } = await authenticate.admin(request);
  let shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop || shop.uninstalledAt || !shop.accessTokenEnc.length) {
    // Primera vez (o instalación anterior a este servidor): se registra ahora.
    await provisionShop(session, admin);
    shop = await db.shop.findUniqueOrThrow({ where: { domain: session.shop } });
  }
  return { shop, admin, session };
}
