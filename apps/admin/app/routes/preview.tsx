/**
 * Iframe de vista previa.
 *
 * Monta el MISMO widget que corre en la tienda, pero en modo demo:
 * no llama al App Proxy, recibe los campos y los tokens por postMessage
 * desde el builder. Si aquí se ve bien, en la tienda se ve bien.
 *
 * Ruta pública (sin autenticación): no expone ningún dato — todo lo que
 * pinta llega por postMessage desde el admin, que sí está autenticado.
 */
export function loader() {
  return new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Solo se puede embeber desde el admin de Shopify.
      'Content-Security-Policy': "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com",
    },
  });
}

const HTML = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:16px;background:#f6f6f7;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
  #root{max-width:420px;margin:0 auto}
  .empty{padding:60px 20px;text-align:center;color:#8a8a8a;font-size:13px}
</style></head>
<body>
<div id="root"><div class="empty">Añade un campo para ver la vista previa.</div></div>

<script type="module">
  import { renderPreview } from '/widget/preview.js';

  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'cod:preview') return;
    renderPreview(document.getElementById('root'), e.data.fields, e.data.tokens);
  });

  // Avisamos al builder de que ya podemos recibir datos.
  parent.postMessage({ type: 'cod:preview-ready' }, '*');
</script>
</body></html>`;
