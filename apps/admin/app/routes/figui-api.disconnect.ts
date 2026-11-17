import type { ActionFunctionArgs } from 'react-router';
import { disconnectFromFigui } from '../lib/figui-connect.server';
import { handle, serverClaims } from '../lib/figui-http.server';

/** Figui desconecta Shopify: se quita el formulario de la tienda y se da de baja. */
export async function action({ request }: ActionFunctionArgs) {
  return handle(async () => disconnectFromFigui(serverClaims(request).shop));
}
