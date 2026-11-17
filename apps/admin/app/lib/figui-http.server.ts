import { verifyFiguiToken, editorTokenFrom, figuiEnabled } from './figui.server';
import { FiguiError } from './figui-connect.server';

/** Respuesta JSON sin caché (datos de una tienda concreta). */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Llamada de servidor de Figui: Authorization: Bearer <jwt aud=cod-server>. */
export function serverClaims(request: Request) {
  if (!figuiEnabled()) throw new FiguiError('La integración con Figui no está configurada.', 503);
  const auth = request.headers.get('authorization') ?? '';
  const claims = verifyFiguiToken(auth.replace(/^Bearer\s+/i, ''), 'cod-server');
  if (!claims) throw new FiguiError('No autorizado.', 401);
  return claims;
}

/** Petición del editor dentro de Figui (iframe). */
export function editorClaims(request: Request) {
  const claims = verifyFiguiToken(editorTokenFrom(request), 'cod-editor');
  if (!claims) throw new FiguiError('La sesión del editor caducó. Vuelve a abrir el formulario desde Figui.', 401);
  return claims;
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof FiguiError) return json({ error: e.message }, e.status);
    console.error('[figui-api]', e);
    return json({ error: 'Error interno del formulario.' }, 500);
  }
}
