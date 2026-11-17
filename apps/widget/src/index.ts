import type { WidgetConfig, SubmitRequest, QuoteResponse } from '@cod/contracts';
import { api, ApiError } from './core/api';
import { tokensToCss } from './core/theme';
import { validateField, isVisible } from './core/validate';
import { renderForm } from './ui/form';
import { CSS } from './ui/styles';

/**
 * Punto de entrada del widget COD.
 *
 * Decisiones que importan:
 * - Shadow DOM: el CSS del tema del merchant NO puede romper el formulario,
 *   y el nuestro no puede romper su tema. Es la única forma de garantizarlo.
 * - El módulo del mapa se carga con import() dinámico: solo si el cliente
 *   pulsa "Usar mi ubicación". El bundle base no lo paga.
 * - El cliente NUNCA ve el resumen del pedido (decisión del proyecto):
 *   ni productos, ni cantidades, ni totales, ni descuentos. Solo confirmación.
 */

export interface MountOptions {
  productId: string;
  variantId: string;
  container: HTMLElement;
}

export async function mount(opts: MountOptions): Promise<void> {
  const host = opts.container;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'cod-root';
  shadow.appendChild(root);

  root.innerHTML = `<div class="cod-skeleton"><span></span><span></span><span></span></div>`;

  let config: WidgetConfig;
  try {
    config = await api.config(opts.productId, opts.variantId);
  } catch (e) {
    // En el editor del tema se explica; en la tienda no se ensucia la página.
    if ((window as Window & { Shopify?: { designMode?: boolean } }).Shopify?.designMode && !host.dataset.floating) {
      const notFound = e instanceof ApiError && e.status === 404;
      root.innerHTML = `<div style="padding:12px;border:1.5px dashed #b5b5b5;border-radius:10px;color:#666;font:14px/1.4 system-ui;text-align:center"><b>Formulario COD</b><br>${
        notFound ? 'Este producto no tiene un formulario asignado. En la app, abre el formulario → Ajustes → «¿En qué productos se muestra?» y elige este producto o todos.'
                 : 'No se pudo cargar el formulario. Revisa que la app esté instalada y vuelve a intentarlo.'}</div>`;
      return;
    }
    host.remove();
    return;
  }

  style.textContent = `:host{${tokensToCss(config.tokens)}}\n${CSS}\n${config.tokens.customCss}`;

  const renderInto = (mountRoot: HTMLElement) => {
    const state = new FormState(config);
    renderForm(mountRoot, config, state, {
      onSubmit: () => submit(mountRoot, config, state),
    });
  };

  // Modo popup: el botón "Comprar ahora" abre el formulario en un modal.
  // Modo embebido (por defecto): el formulario va directo en la página.
  // Manda el bloque del tema si lo fija; si no, lo que se eligió en el panel.
  const mode = host.dataset.mode === 'popup' || host.dataset.mode === 'embedded'
    ? host.dataset.mode
    : config.displayMode === 'POPUP' ? 'popup' : 'embedded';
  if (mode === 'popup') {
    const { renderTrigger } = await import('./ui/trigger');
    root.innerHTML = '';
    root.classList.add('cod-root-trigger');
    const floating = host.dataset.floating === 'true';
    host.dataset.codRendered = 'button';
    if (floating) {
      // Botón flotante (App Embed): fijo abajo, siempre a mano en el móvil.
      host.style.cssText = 'position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));'
        + 'z-index:2147482000;display:flex;justify-content:center;transition:opacity .25s ease,transform .25s ease;';
      hideWhileInlineVisible(host);
    }
    renderTrigger(root, config.tokens.trigger, () => {
      // Si en la página ya está el formulario completo, el botón flotante lleva hasta él.
      const inlineForm = floating ? findInline('form') : null;
      if (inlineForm) inlineForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else openModal(shadow, config, renderInto);
    });
    try { api.track(config.formId, 'view', config.formVersionId); } catch { /* nunca bloquea */ }
    return;
  }

  root.innerHTML = '';
  host.dataset.codRendered = 'form';
  renderInto(root);
  // Embudo: registramos la vista. sessionId estable por montaje.
  try { api.track(config.formId, 'view', config.formVersionId); } catch { /* nunca bloquea */ }
}

/** Formularios o botones puestos en la página (no flotantes). */
function inlineHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-cod-form]')].filter((el) => el.dataset.floating !== 'true');
}

function findInline(kind: 'form' | 'button'): HTMLElement | null {
  return inlineHosts().find((el) => el.isConnected && el.dataset.codRendered === kind && el.getClientRects().length > 0) ?? null;
}

/**
 * El botón flotante se esconde mientras se ve en pantalla un botón o formulario
 * puesto en la página, y vuelve a aparecer al pasarlo. Así nunca hay dos
 * «Comprar ahora» a la vez.
 */
function hideWhileInlineVisible(floatingHost: HTMLElement): void {
  if (!('IntersectionObserver' in window)) return;
  const visible = new Set<Element>();
  const apply = () => {
    for (const el of visible) if (!el.isConnected) visible.delete(el);
    const hide = visible.size > 0;
    floatingHost.style.opacity = hide ? '0' : '1';
    floatingHost.style.transform = hide ? 'translateY(120%)' : 'none';
    floatingHost.style.pointerEvents = hide ? 'none' : 'auto';
    floatingHost.setAttribute('aria-hidden', String(hide));
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      // Un bloque que no llegó a montarse (sin formulario para el producto) no cuenta.
      if (e.isIntersecting && e.target.isConnected) visible.add(e.target); else visible.delete(e.target);
    }
    apply();
  }, { threshold: 0.15 });
  const watched = new WeakSet<Element>();
  const scan = () => { inlineHosts().forEach((el) => { if (!watched.has(el)) { watched.add(el); io.observe(el); } }); apply(); };
  scan();
  // Por si el tema añade el bloque después (carga diferida, editor del tema).
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}

/** Modal para el modo popup. El formulario se monta fresco cada apertura. */
function openModal(shadow: ShadowRoot, config: WidgetConfig, renderInto: (el: HTMLElement) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'cod-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'cod-modal';
  modal.innerHTML = `<button class="cod-modal-close" aria-label="Cerrar">✕</button><div class="cod-modal-body"></div>`;
  overlay.appendChild(modal);
  // Dentro del Shadow DOM: así el modal y el formulario llevan sus estilos.
  shadow.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('cod-open'));

  const close = () => {
    overlay.classList.remove('cod-open');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 250);
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  modal.querySelector('.cod-modal-close')!.addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  const formRoot = document.createElement('div');
  formRoot.className = 'cod-root';
  modal.querySelector<HTMLElement>('.cod-modal-body')!.appendChild(formRoot);
  renderInto(formRoot);
}

export interface QuoteInput {
  formId: string; variantId: string; qty: number;
  province: string | null; discountCode: string | null; addonIds: string[];
}

/** Estado del formulario. Deliberadamente simple: sin framework, sin peso. */
export class FormState {
  values: Record<string, string> = {};
  qty = 1;
  location: SubmitRequest['location'] = null;
  discountCode: string | null = null;
  acceptedAddons: { id: string; variantId: string | null; qty: number }[] = [];
  readonly idempotencyKey: string;

  /** Última cotización del servidor (precio real, descuento validado). */
  quote: QuoteResponse | null = null;
  /** Quién cotiza: la API en la tienda; un cálculo local en la vista previa del panel. */
  quoter: (r: QuoteInput) => Promise<QuoteResponse> = (r) => api.quote(r);
  private quoteListeners: ((q: QuoteResponse) => void)[] = [];
  private quoteKey = '';
  private quoteTimer = 0;
  readonly startedAt = Date.now();

  constructor(readonly config: WidgetConfig) {
    // Se genera al ABRIR el formulario, no al enviarlo: un doble-tap en
    // "Finalizar" manda la misma clave y el backend devuelve el mismo pedido.
    this.idempotencyKey = crypto.randomUUID();

    for (const f of config.fields) {
      if (f.defaultValue) this.values[f.key] = f.defaultValue;
    }
  }

  onQuote(fn: (q: QuoteResponse) => void) { this.quoteListeners.push(fn); }

  private quoteInput(discountCode = this.discountCode): QuoteInput {
    return {
      formId: this.config.formId,
      variantId: this.config.product.variantId,
      qty: this.qty,
      province: this.values.province || this.values.provinceCode || null,
      discountCode,
      addonIds: this.acceptedAddons.map((a) => a.id),
    };
  }

  /** Recotiza (con pausa de 300 ms) solo si cambió algo que afecta al precio. */
  requestQuote(): void {
    const key = JSON.stringify(this.quoteInput());
    if (key === this.quoteKey) return;
    this.quoteKey = key;
    window.clearTimeout(this.quoteTimer);
    this.quoteTimer = window.setTimeout(() => {
      this.quoter(this.quoteInput())
        .then((q) => { this.quote = q; this.quoteListeners.forEach((fn) => fn(q)); })
        .catch(() => { this.quoteKey = ''; /* el precio es informativo: nunca bloquea */ });
    }, 300);
  }

  /** Valida un código en el servidor. Devuelve la cotización con o sin el descuento aplicado. */
  async applyDiscount(code: string | null): Promise<QuoteResponse> {
    const q = await this.quoter(this.quoteInput(code));
    this.discountCode = q.appliedDiscount ? q.appliedDiscount.code : null;
    this.quote = q;
    this.quoteKey = JSON.stringify(this.quoteInput());
    this.quoteListeners.forEach((fn) => fn(q));
    return q;
  }

  visibleFields() {
    return this.config.fields.filter((f) => isVisible(f, this.values));
  }

  /** Devuelve los errores por campo. Vacío = válido. */
  validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const f of this.visibleFields()) {
      const err = validateField(f, this.values[f.key] ?? '');
      if (err) errors[f.key] = err;
    }
    return errors;
  }
}

async function submit(root: HTMLElement, config: WidgetConfig, state: FormState): Promise<void> {
  const btn = root.querySelector<HTMLButtonElement>('.cod-submit')!;
  const errBox = root.querySelector<HTMLElement>('.cod-form-error')!;

  btn.disabled = true;
  btn.classList.add('cod-loading');
  errBox.textContent = '';

  const payload: SubmitRequest = {
    formId: config.formId,
    formVersionId: config.formVersionId,
    idempotencyKey: state.idempotencyKey,
    variantId: config.product.variantId,
    qty: state.qty,
    discountCode: state.discountCode,
    acceptedAddons: state.acceptedAddons,
    fields: state.values,
    location: state.location,
    startedAt: state.startedAt,
    hp: '', // honeypot: si un bot lo rellena, el backend rechaza
  };

  try {
    const res = await api.submit(payload);
    try { api.track(config.formId, 'submit_attempt', state.idempotencyKey); } catch { /* no bloquea */ }
    showConfirmation(root, res);
  } catch (e) {
    btn.disabled = false;
    btn.classList.remove('cod-loading');
    errBox.textContent =
      e instanceof ApiError ? e.message : 'No pudimos enviar tu pedido. Inténtalo de nuevo.';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Pantalla final. SIN resumen: ni producto, ni cantidad, ni total, ni descuentos.
 * El texto (título y mensaje) es editable desde el panel.
 *
 * Destino tras los N segundos, según config del merchant:
 *   - 'whatsapp' → abre chat de WhatsApp con el mensaje predeterminado ya escrito.
 *   - 'thankyou' → página de gracias del tema.
 *   - 'none'     → se queda en la confirmación.
 */
function showConfirmation(root: HTMLElement, res: import('@cod/contracts').SubmitResponse): void {
  const goWhatsapp = res.redirectTarget === 'whatsapp' && !!res.whatsappUrl;
  const willRedirect = goWhatsapp || res.redirectTarget === 'thankyou';
  const dest = goWhatsapp ? res.whatsappUrl! : res.redirectUrl;

  // Píxel de compra (client-side). Mismo eventId que el CAPI → Meta deduplica.
  // El server-side es el que cuenta; este cubre a quien no tenga ad-blocker.
  if (res.purchasePixel) firePurchasePixel(res.purchasePixel);

  root.innerHTML = `
    <div class="cod-done">
      <div class="cod-done-tick">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"
             stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h3>${escapeHtml(res.title)}</h3>
      <p>${escapeHtml(res.message)}</p>
      ${willRedirect
        ? `<div class="cod-done-bar"><span style="animation-duration:${res.redirectDelayMs}ms"></span></div>
           <small>${goWhatsapp ? 'Abriendo WhatsApp…' : 'Redirigiendo…'}</small>`
        : ''}
      ${goWhatsapp
        // Fallback: si el navegador bloquea la redirección automática, hay un botón.
        ? `<a class="cod-wa-btn" href="${res.whatsappUrl}" target="_blank" rel="noopener">
             Continuar por WhatsApp</a>`
        : ''}
    </div>`;

  root.querySelector('.cod-done')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (willRedirect) {
    window.setTimeout(() => {
      // WhatsApp en móvil abre la app nativa; assign() lo maneja igual que una URL normal.
      window.location.assign(dest);
    }, res.redirectDelayMs);
  }
}

/**
 * Dispara el evento de compra en los píxeles del navegador que el merchant
 * haya configurado. Si el píxel base (fbq/ttq) no está cargado en el tema, lo
 * inicializamos al vuelo con su ID. `eventID` va compartido con el CAPI.
 */
function firePurchasePixel(p: NonNullable<import('@cod/contracts').SubmitResponse['purchasePixel']>): void {
  const value = p.valueCents / 100;

  try {
    if (p.metaPixelId) {
      const w = window as unknown as { fbq?: (...a: unknown[]) => void };
      if (!w.fbq) {
        // Snippet mínimo de Meta Pixel.
        (function (f: any, b, e, v) {
          if (f.fbq) return; const n: any = (f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          });
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
          const t = b.createElement(e) as HTMLScriptElement; t.async = true; t.src = v;
          const s = b.getElementsByTagName(e)[0]!; s.parentNode!.insertBefore(t, s);
        })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        w.fbq!('init', p.metaPixelId);
      }
      w.fbq!('track', p.eventName, { currency: p.currency, value }, { eventID: p.eventId });
    }

    if (p.tiktokPixelId) {
      const w = window as unknown as { ttq?: { track: (...a: unknown[]) => void } };
      w.ttq?.track('CompletePayment', { currency: p.currency, value, event_id: p.eventId });
    }
  } catch {
    // Un fallo del píxel del navegador JAMÁS bloquea la confirmación:
    // el CAPI server-side ya registró la compra.
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/* ── Auto-montaje desde la Theme App Extension ── */
declare global {
  interface Window { CodForm?: { mount: typeof mount } }
}

/**
 * Botón fijo automático: lo pone justo debajo del «Agregar al carrito» del
 * tema (como las apps COD conocidas), sin que el comerciante tenga que añadir
 * un bloque. Si ya puso un bloque a mano, no se duplica.
 */
function autoPlace(): void {
  // Si el comerciante puso su propio bloque, manda ese: fuera el automático.
  const manualShown = () => inlineHosts().some((el) => !el.dataset.codAuto && el.isConnected && el.getClientRects().length > 0);
  if (manualShown()) document.querySelectorAll('[data-cod-auto]').forEach((el) => el.remove());
  document.querySelectorAll<HTMLElement>('[data-cod-autoplace]').forEach((marker) => {
    if (manualShown()) { marker.remove(); return; }
    const anchor = findBuyAnchor((marker.dataset.variantId ?? '').replace(/\D/g, ''));
    if (!anchor) return; // se reintenta cuando el tema termine de cargar
    const el = document.createElement('div');
    el.setAttribute('data-cod-form', '');
    el.dataset.mode = 'popup';
    el.dataset.codAuto = '1';
    el.dataset.productId = marker.dataset.productId ?? '';
    el.dataset.variantId = marker.dataset.variantId ?? '';
    el.style.margin = '10px 0';
    anchor.insertAdjacentElement('afterend', el);
    marker.remove();
  });
}

/** Tarjetas de «productos relacionados», carruseles, etc.: nunca son el sitio. */
const CARD = 'product-card, .card, .card-wrapper, [class*="product-card"], [class*="related"], [class*="recommend"], [id*="related"], [id*="recommend"]';

function findBuyAnchor(variant: string): HTMLElement | null {
  const shown = (e: Element) => e.getClientRects().length > 0;
  const forms = [...document.querySelectorAll<HTMLFormElement>('form[action*="/cart/add"]')].filter((f) =>
    !f.closest('[data-cod-form]') && shown(f)
    && f.querySelector('button[type="submit"], button[name="add"], input[type="submit"]'));
  const idOf = (f: HTMLFormElement) => (f.querySelector<HTMLInputElement | HTMLSelectElement>('[name="id"]')?.value ?? '');
  const form = forms.find((f) => idOf(f) === variant)
    ?? forms.find((f) => !f.closest(CARD) && f.closest('[id*="main"], [id*="product-information"], [id*="product-template"]'))
    ?? null;
  if (form) return form.closest<HTMLElement>('product-form, product-form-component') ?? form;
  // Sin botón de compra (p. ej. producto agotado en algunos temas): debajo del precio.
  const price = [...document.querySelectorAll<HTMLElement>(
    'main product-price, main .product__price, main [id^="price-"], main .price, #MainContent .price',
  )].find((e) => shown(e) && !e.closest(`[data-cod-form], ${CARD}`));
  return price ?? null;
}

function boot() {
  autoPlace();
  document.querySelectorAll<HTMLElement>('[data-cod-form]:not([data-cod-mounted])').forEach((el) => {
    el.dataset.codMounted = '1';
    // Código pegado en «Liquid personalizado»: los ids llegan como números.
    if (/^\d+$/.test(el.dataset.productId ?? '')) el.dataset.productId = `gid://shopify/Product/${el.dataset.productId}`;
    if (/^\d+$/.test(el.dataset.variantId ?? '')) el.dataset.variantId = `gid://shopify/ProductVariant/${el.dataset.variantId}`;
    // Sin producto (portada, colecciones…) no hay nada que mostrar.
    if (!/\d+$/.test(el.dataset.variantId ?? '') || !/\d+$/.test(el.dataset.productId ?? '')) { el.remove(); return; }
    void mount({
      productId: el.dataset.productId!,
      variantId: el.dataset.variantId!,
      container: el,
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
window.addEventListener('load', () => {
  autoPlace(); boot();
  if (/[?&]cod_debug=1/.test(location.search)) setTimeout(showDebug, 2500);
});

function showDebug(): void {
  const shown = (e: Element) => e.getClientRects().length > 0;
  const desc = (e: Element | null) => e ? `<${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}>` : 'ninguno';
  const hosts = [...document.querySelectorAll<HTMLElement>('[data-cod-form]')];
  const marker = document.querySelector<HTMLElement>('[data-cod-autoplace]');
  const lines = [
    `Incrustación «COD Forms»: ${document.querySelector('[data-floating="true"], [data-cod-auto], [data-cod-autoplace]') ? 'activa' : 'NO activa o sin producto'}`,
    `Botón automático: ${document.querySelector('[data-cod-auto]') ? 'puesto' : marker ? 'sin sitio (no encontré «Agregar al carrito» ni el precio)' : 'no pedido / quitado'}`,
    `Sitio elegido: ${desc(findBuyAnchor((marker?.dataset.variantId ?? '').replace(/\D/g, '')))}`,
    `Formularios de compra del tema: ${document.querySelectorAll('form[action*="/cart/add"]').length}`,
    ...hosts.map((h, i) => `#${i + 1} ${h.dataset.floating ? 'flotante' : h.dataset.codAuto ? 'automático' : 'bloque manual'} · muestra: ${h.dataset.codRendered ?? 'nada'} · visible: ${shown(h) ? 'sí' : 'no'} · dentro de ${desc(h.parentElement)}`),
  ];
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;background:#111;color:#0f0;font:12px/1.4 monospace;padding:10px;border-radius:8px;white-space:pre-wrap;max-height:60vh;overflow:auto';
  box.textContent = 'COD Forms — diagnóstico\n' + lines.join('\n');
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
  console.log(box.textContent);
}

// Editor del tema (y temas que cargan secciones después): al añadir o recargar
// una sección, su bloque aparece al momento, sin recargar la página.
let bootQueued = false;
const queueBoot = () => {
  if (bootQueued) return;
  bootQueued = true;
  requestAnimationFrame(() => { bootQueued = false; boot(); });
};
new MutationObserver((muts) => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n instanceof HTMLElement && (n.matches('[data-cod-form]') || n.querySelector('[data-cod-form]'))) { queueBoot(); return; }
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('shopify:section:load', queueBoot);

window.CodForm = { mount };
