import type { ActionFunctionArgs } from 'react-router';

/**
 * El editor dentro de Figui avisa aquí cuando algo falla en el navegador, para
 * verlo en los registros del servidor. Solo texto del error (nada del cliente).
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const raw = (await request.text()).slice(0, 4000);
    const body = JSON.parse(raw) as { message?: unknown; stack?: unknown; path?: unknown };
    const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\r\n]+/g, ' | ').slice(0, n);
    console.error(`[editor-figui] error en el navegador: ${clean(body.message, 300)} @ ${clean(body.path, 120)} :: ${clean(body.stack, 1500)}`);
  } catch { /* nada */ }
  return new Response(null, { status: 204 });
}
