import type { ActionFunctionArgs } from 'react-router';
import { updateStorefront } from '../lib/figui-connect.server';
import { handle, serverClaims } from '../lib/figui-http.server';

/** Encender/apagar el formulario en la tienda y dónde sale el botón. */
export async function action({ request }: ActionFunctionArgs) {
  return handle(async () => {
    const claims = serverClaims(request);
    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown; autoPlace?: unknown; floating?: unknown; cartButton?: unknown };
    const pick = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
    return updateStorefront(claims.shop, { enabled: pick(body.enabled), autoPlace: pick(body.autoPlace), floating: pick(body.floating), cartButton: pick(body.cartButton) });
  });
}
