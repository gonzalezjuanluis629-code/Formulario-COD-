import type { ActionFunctionArgs } from 'react-router';
import { FiguiError, refreshTokenFromFigui } from '../lib/figui-connect.server';
import { handle, serverClaims } from '../lib/figui-http.server';

/** Figui avisa de un acceso nuevo a Shopify (reconexión). Solo actualiza tiendas que ya usan el formulario. */
export async function action({ request }: ActionFunctionArgs) {
  return handle(async () => {
    const claims = serverClaims(request);
    const body = (await request.json().catch(() => ({}))) as { accessToken?: string; scopes?: string };
    if (!body.accessToken) throw new FiguiError('Falta el acceso a Shopify.');
    return refreshTokenFromFigui(claims.shop, body.accessToken, String(body.scopes ?? ''));
  });
}
