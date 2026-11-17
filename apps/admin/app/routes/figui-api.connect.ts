import type { ActionFunctionArgs } from 'react-router';
import { connectFromFigui, statusFor, FiguiError } from '../lib/figui-connect.server';
import { handle, serverClaims } from '../lib/figui-http.server';

/** Figui conecta (o refresca) la tienda: manda su acceso a Shopify y los permisos. */
export async function action({ request }: ActionFunctionArgs) {
  return handle(async () => {
    const claims = serverClaims(request);
    const body = (await request.json().catch(() => ({}))) as { accessToken?: string; scopes?: string };
    if (!body.accessToken) throw new FiguiError('Falta el acceso a Shopify.');
    await connectFromFigui({ shop: claims.shop, accessToken: body.accessToken, scopes: String(body.scopes ?? '') });
    return statusFor(claims.shop);
  });
}
