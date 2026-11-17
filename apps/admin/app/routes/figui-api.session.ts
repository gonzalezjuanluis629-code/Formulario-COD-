import type { ActionFunctionArgs } from 'react-router';
import { db } from '../db.server';
import { FiguiError } from '../lib/figui-connect.server';
import { signFiguiToken } from '../lib/figui.server';
import { editorClaims, handle } from '../lib/figui-http.server';

/**
 * El enlace que abre el editor lleva un token corto (minutos). Al cargar, el
 * editor lo cambia aquí por la sesión de trabajo (12 h), que viaja solo en
 * cabeceras: así nunca queda en los registros de URLs ni en el historial.
 */
export async function action({ request }: ActionFunctionArgs) {
  return handle(async () => {
    const claims = editorClaims(request);
    const shop = await db.shop.findUnique({ where: { domain: claims.shop } });
    if (!shop || shop.uninstalledAt) throw new FiguiError('Esta tienda no está conectada al formulario.', 404);
    return { token: signFiguiToken({ shop: claims.shop, aud: 'cod-editor', sub: claims.sub, ttlSec: 12 * 3600 }) };
  });
}
