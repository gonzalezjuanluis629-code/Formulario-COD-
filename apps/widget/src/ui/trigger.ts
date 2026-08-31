import type { TriggerButton } from '@cod/contracts';

/**
 * Botón que ABRE el formulario ("Comprar ahora").
 *
 * Vive en el tema, FUERA del Shadow DOM del formulario, así que se estila con
 * estilos propios inyectados una sola vez. Todo es configurable desde el panel:
 * tamaño, colores, icono (emoji o imagen) y descripciones rotativas.
 *
 * Las descripciones rotan tipo carrusel bajo el título: "Envío gratis" → (3s) →
 * "Pago contra entrega" → … Esto sube la confianza sin ocupar espacio extra.
 */
export function renderTrigger(host: HTMLElement, cfg: TriggerButton, onClick: () => void): void {
  injectStylesOnce();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `cod-trigger cod-trigger-anim-${cfg.animation}`;
  btn.style.cssText = [
    `--t-bg:${cfg.bg}`,
    `--t-color:${cfg.color}`,
    `--t-radius:${cfg.radius}px`,
    `height:${cfg.height}px`,
    cfg.width && cfg.width !== 'auto' ? `width:${cfg.width}` : '',
  ].filter(Boolean).join(';');

  const icon =
    cfg.iconType === 'image' && cfg.iconImageUrl
      ? `<img class="cod-trigger-img" src="${escapeAttr(cfg.iconImageUrl)}" alt="">`
      : cfg.iconType === 'emoji'
        ? `<span class="cod-trigger-emoji">${escapeHtml(cfg.icon)}</span>`
        : '';

  const descs = cfg.descriptions.filter((d) => d.trim());

  btn.innerHTML = `
    ${icon}
    <span class="cod-trigger-text">
      <span class="cod-trigger-title" style="font-size:${cfg.fontSize}px">${escapeHtml(cfg.text)}</span>
      ${descs.length
        ? `<span class="cod-trigger-descs" style="font-size:${cfg.descriptionFontSize}px">
             ${descs.map((d, i) => `<span class="cod-trigger-desc${i === 0 ? ' on' : ''}">${escapeHtml(d)}</span>`).join('')}
           </span>`
        : ''}
    </span>`;

  btn.addEventListener('click', onClick);
  host.appendChild(btn);

  // Carrusel de descripciones. Un solo timer, se limpia si el nodo desaparece.
  if (descs.length > 1) {
    const items = btn.querySelectorAll<HTMLElement>('.cod-trigger-desc');
    let i = 0;
    const timer = window.setInterval(() => {
      if (!btn.isConnected) { window.clearInterval(timer); return; }
      items[i]?.classList.remove('on');
      i = (i + 1) % items.length;
      items[i]?.classList.add('on');
    }, cfg.descriptionIntervalMs);
  }
}

let stylesInjected = false;
function injectStylesOnce(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .cod-trigger{display:inline-flex;align-items:center;gap:10px;justify-content:center;
      padding:0 22px;background:var(--t-bg);color:var(--t-color);border:0;border-radius:var(--t-radius);
      font-family:inherit;font-weight:700;cursor:pointer;line-height:1.15;overflow:hidden;
      transition:transform .12s cubic-bezier(.32,.72,0,1),filter .2s;-webkit-tap-highlight-color:transparent}
    .cod-trigger:hover{filter:brightness(1.08)}
    .cod-trigger:active{transform:scale(.97)}
    .cod-trigger-emoji{font-size:1.15em;line-height:1}
    .cod-trigger-img{width:1.4em;height:1.4em;object-fit:contain;border-radius:4px}
    .cod-trigger-text{display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-width:0}
    .cod-trigger-title{font-weight:700}
    .cod-trigger-descs{position:relative;display:block;height:1.3em;overflow:hidden;font-weight:500;opacity:.9}
    .cod-trigger-desc{position:absolute;left:0;top:0;white-space:nowrap;opacity:0;transform:translateY(60%);
      transition:opacity .4s cubic-bezier(.32,.72,0,1),transform .4s cubic-bezier(.32,.72,0,1)}
    .cod-trigger-desc.on{opacity:1;transform:translateY(0)}

    .cod-trigger-anim-pulse{animation:cod-trig-pulse 2.4s ease-in-out infinite}
    @keyframes cod-trig-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}
      50%{box-shadow:0 0 0 6px rgba(0,0,0,.04)}}
    .cod-trigger-anim-bounce{animation:cod-trig-bounce 2.2s ease-in-out infinite}
    @keyframes cod-trig-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
    .cod-trigger-anim-shine{position:relative}
    .cod-trigger-anim-shine::after{content:"";position:absolute;inset:0;
      background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);
      transform:translateX(-100%);animation:cod-trig-shine 3s ease-in-out infinite}
    @keyframes cod-trig-shine{0%,60%{transform:translateX(-100%)}100%{transform:translateX(100%)}}

    @media(prefers-reduced-motion:reduce){.cod-trigger,.cod-trigger *{animation:none!important}}
  `;
  document.head.appendChild(style);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const escapeAttr = (s: string) => escapeHtml(s).replace(/`/g, '');
