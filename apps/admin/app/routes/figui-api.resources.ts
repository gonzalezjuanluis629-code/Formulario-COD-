import type { LoaderFunctionArgs } from 'react-router';
import { db } from '../db.server';
import { FiguiError, searchResources } from '../lib/figui-connect.server';
import { editorClaims, handle } from '../lib/figui-http.server';

/** Selector de productos/colecciones del editor cuando se usa desde Figui. */
export async function loader({ request }: LoaderFunctionArgs) {
  return handle(async () => {
    const claims = editorClaims(request);
    const shop = await db.shop.findUnique({ where: { domain: claims.shop } });
    if (!shop) throw new FiguiError('Tienda no conectada.', 404);
    const url = new URL(request.url);
    const type = url.searchParams.get('type') === 'collection' ? 'collection' : 'product';
    try {
      return { items: await searchResources(shop.id, shop.domain, shop.accessTokenEnc, type, url.searchParams.get('q') ?? '') };
    } catch {
      throw new FiguiError('No se pudieron cargar los productos de Shopify.', 502);
    }
  });
}
