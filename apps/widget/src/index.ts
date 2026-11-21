import type { WidgetConfig, SubmitRequest, QuoteResponse } from '@cod/contracts';
import { api, ApiError, DIRECT, readCart, readCartFull, clearCart, type ShopCartLine } from './core/api';
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

  // El botón «Comprar ahora» se descarga mientras llegan los datos del formulario
  // (no después): el botón sale antes.
  if (host.dataset.mode !== 'embedded') void import('./ui/trigger').catch(() => undefined);

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
  preloadParts(config);

  const isCart = host.dataset.cart === 'true';

  const renderInto = (mountRoot: HTMLElement) => {
    if (isCart) { renderCartInto(mountRoot, config); return; }
    const state = new FormState(config);
    // Si la página ya tiene su propia oferta o selector de cantidad («2 unidades»),
    // el formulario empieza con esa cantidad y la sigue mientras esté abierto.
    const fromPage = pageQuantityInfo(config.product.variantId);
    if (fromPage && (fromPage.qty > 1 || fromPage.managed)) { state.qty = fromPage.qty; state.qtyFromPage = true; }
    if (fromPage?.managed) state.pageManagesQty = true;
    renderForm(mountRoot, config, state, {
      onSubmit: () => submit(mountRoot, config, state),
    });
    const follow = () => window.setTimeout(() => {
      if (!mountRoot.isConnected) { document.removeEventListener('change', follow, true); return; }
      const q = pageQuantity(config.product.variantId);
      if (q) state.setQtyFromPage(q);
    }, 60);
    document.addEventListener('change', follow, true);
  };

  // Modo popup: el botón "Comprar ahora" abre el formulario en un modal.
  // Modo embebido (por defecto): el formulario va directo en la página.
  // Manda el bloque del tema si lo fija; si no, lo que se eligió en el panel.
  const mode = isCart ? 'popup' : host.dataset.mode === 'popup' || host.dataset.mode === 'embedded'
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
      if (inlineForm) { inlineForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      // Con el carrito lateral abierto, el toque es para pagar EL CARRITO (este
      // botón puede quedar encima del «Comprar ahora» del carrito).
      if (!isCart && DIRECT?.cartButton && cartOpen()) { void openCartForm(); return; }
      fireCheckoutPixel(config); // «Inicio de pago»: al abrir el formulario, no al cargar la página
      openModal(shadow, config, renderInto);
    });
    try { api.track(config.formId, 'view', config.formVersionId); } catch { /* nunca bloquea */ }
    if (!floating && !isCart) ensureFloating(host);
    return;
  }

  root.innerHTML = '';
  host.dataset.codRendered = 'form';
  renderInto(root);
  ensureFloating(host);
  // Embudo: registramos la vista. sessionId estable por montaje.
  try { api.track(config.formId, 'view', config.formVersionId); } catch { /* nunca bloquea */ }
  // Formulario en la página: «Inicio de pago» cuando el cliente empieza a llenarlo.
  root.addEventListener('focusin', () => fireCheckoutPixel(config), { once: true });
}

/**
 * Descarga en segundo plano (cuando el navegador está libre) las partes que el
 * formulario usará: así al abrirlo los extras y el mapa salen al instante.
 */
let preloaded = false;
function preloadParts(config: WidgetConfig): void {
  if (preloaded) return;
  preloaded = true;
  const go = () => {
    if (config.addons.length) void import('./ui/addons').catch(() => undefined);
    if (config.fields.some((f) => f.type === 'location')) void import('./ui/map').catch(() => undefined);
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(go, { timeout: 2500 }); else window.setTimeout(go, 1200);
}

/**
 * Formulario abierto desde el carrito: cobra TODO lo que hay en él. Se lee el
 * carrito al abrir (no al cargar la página) para que esté al día.
 */
function renderCartInto(mountRoot: HTMLElement, config: WidgetConfig): void {
  mountRoot.innerHTML = `<div class="cod-skeleton"><span></span><span></span><span></span></div>`;
  readCartFull().then(({ lines, token, totalCents }) => {
    if (!mountRoot.isConnected) return;
    if (!lines.length) {
      mountRoot.innerHTML = '<div class="cod-form-error" role="alert">Tu carrito está vacío.</div>';
      return;
    }
    const state = new FormState(config);
    state.cart = lines.map((l) => ({ variantId: l.variantId, qty: l.qty }));
    // Se cobra el TOTAL DEL CARRITO (con los descuentos de la tienda): el
    // servidor lo lee de la tienda con este token.
    state.cartToken = token;
    state.cartTotalCents = totalCents;
    // Las tarjetas de cantidad son de un producto: en el carrito no se muestran.
    state.pageManagesQty = true;
    renderForm(mountRoot, config, state, { onSubmit: () => submit(mountRoot, config, state) });
  }).catch(() => {
    if (mountRoot.isConnected) mountRoot.innerHTML = '<div class="cod-form-error" role="alert">No pudimos leer tu carrito. Recarga la página e inténtalo de nuevo.</div>';
  });
}

/** Formularios o botones puestos en la página (no flotantes). */
function inlineHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-cod-form]')].filter((el) => el.dataset.floating !== 'true');
}

/** Botones o formularios fijos de un producto (no los del carrito). */
function fixedHosts(): HTMLElement[] {
  return inlineHosts().filter((el) => el.dataset.cart !== 'true' && el.isConnected && !el.closest(CART_AREA));
}

function findInline(kind: 'form' | 'button'): HTMLElement | null {
  return fixedHosts().find((el) => el.dataset.codRendered === kind && el.getClientRects().length > 0) ?? null;
}

/**
 * Botón flotante: SOLO en páginas donde hay un botón (o formulario) fijo, y con
 * el mismo producto. En la portada con un botón pegado a mano también sale;
 * en páginas sin botón fijo, no. (Tiendas conectadas desde Figui; con la app
 * de Shopify lo pone la incrustación del tema.)
 */
/** Carritos laterales y paneles: un botón dentro de ellos no es «un botón en la página». */
const CART_AREA = '#pd-cart, .pd-panel, cart-drawer, cart-notification, [id*="CartDrawer"], [id*="cart-drawer"], [class*="cart-drawer"], [class*="CartDrawer"], [class*="mini-cart"], [class*="minicart"], [id*="mini-cart"], [role="dialog"]';

function ensureFloating(from: HTMLElement): void {
  if (!DIRECT?.floating || from.dataset.floating === 'true' || from.dataset.cart === 'true') return;
  // El flotante sale solo donde la tienda puso el botón (producto, o la portada
  // si lo pegó ahí). Un botón dentro del carrito lateral no cuenta: ese carrito
  // existe en todas las páginas y el flotante saldría en todas.
  if (from.closest(CART_AREA)) return;
  if (document.querySelector('[data-cod-form][data-floating="true"]')) return;
  const el = document.createElement('div');
  el.setAttribute('data-cod-form', '');
  el.dataset.mode = 'popup';
  el.dataset.floating = 'true';
  el.dataset.codAutoFloat = '1';
  el.dataset.productId = from.dataset.productId ?? '';
  el.dataset.variantId = from.dataset.variantId ?? '';
  document.body.appendChild(el);
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
    // También se esconde con un carrito lateral o una ventana del tema abiertos:
    // si no, quedaba ENCIMA de sus botones (p. ej. «Comprar ahora» del carrito).
    const hide = visible.size > 0 || overlayOpen() || cartOpen();
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
  let mo: MutationObserver | null = null;
  const scan = () => {
    // El flotante automático se va si ya no queda ningún botón fijo en la página.
    if (floatingHost.dataset.codAutoFloat && !fixedHosts().length) {
      floatingHost.remove(); io.disconnect(); mo?.disconnect(); return;
    }
    inlineHosts().forEach((el) => { if (!watched.has(el)) { watched.add(el); io.observe(el); } });
    apply();
  };
  scan();
  // Por si el tema añade el bloque después (carga diferida, editor del tema).
  mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });
  // Abrir/cerrar carritos y ventanas del tema (cambian clases o aria-hidden).
  let queued = false;
  new MutationObserver(() => {
    if (queued || !floatingHost.isConnected) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-hidden', 'open', 'aria-modal'] });
}

/** Carritos laterales y ventanas del tema abiertos (no los nuestros). */
const OVERLAY = '[role="dialog"]:not([aria-hidden="true"]), [aria-modal="true"], dialog[open], cart-drawer[open], cart-drawer.active, .drawer.active, .is-open[role="dialog"]';
function overlayOpen(): boolean {
  return [...document.querySelectorAll<HTMLElement>(OVERLAY)].some((el) => {
    if (el.closest('[data-cod-form], [data-cod-modal]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= window.innerHeight) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  });
}

/** Carrito lateral abierto (temas comunes y el de la tienda), aunque no se marque como ventana. */
const CART_OPEN = '#pd-cart.is-open, .pd-panel.is-open, cart-drawer[open], cart-drawer.active, cart-drawer.is-open, .cart-drawer.active, .cart-drawer.is-open, .cart-drawer--active, [id*="CartDrawer"].active, [id*="CartDrawer"].is-open, [id*="cart-drawer"].active, [id*="cart-drawer"].is-open, .drawer--cart.is-open';
/** Último toque dentro de un carrito lateral (el tema puede cerrarlo y luego «pulsar» nuestro botón). */
let lastCartTap = 0;
const markCartTap = (e: Event) => {
  const t = e.target as Element | null;
  if (!t?.closest?.(`${CART_OPEN}, #pd-cart, .pd-panel, cart-drawer, [id*="CartDrawer"], [class*="cart-drawer"]`)) return;
  // Cerrar el carrito (la X o el fondo oscuro) no cuenta como «pagar desde el carrito».
  if (t.closest('[data-pd-close], [aria-label*="errar"], [aria-label*="lose"], .close, [class*="overlay"], [class*="close"]')) return;
  lastCartTap = Date.now();
};
document.addEventListener('pointerdown', markCartTap, true);
document.addEventListener('click', markCartTap, true);

function cartOpen(): boolean {
  if (Date.now() - lastCartTap < 1000) return true;
  const big = (e: Element) => {
    const r = e.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
  };
  return [...document.querySelectorAll<HTMLElement>(CART_OPEN)].some((el) => {
    if (el.closest('[data-cod-form], [data-cod-modal]')) return false;
    // El contenedor puede medir 0 y su panel (fijo) sí verse: se mira también lo de dentro.
    return big(el) || [...el.children].some((c) => big(c) && getComputedStyle(c).visibility !== 'hidden');
  });
}

/**
 * Botones del tema que antes abrían otra app de pago contra entrega desde el
 * carrito (p. ej. el «Comprar ahora · Paga al recibir» del carrito lateral):
 * ahora abren ESTE formulario con todo el carrito.
 */
export const CART_TRIGGERS = '[data-pd-rsi-cart], a[href*="pd_cod=1"], [data-cod-open-cart]';
/** Botones que deja Releasit en el tema (aunque ya no se use): abren ESTE formulario. */
const RELEASIT = '#rsi_buy_now_button, .rsi_animation_shake, [data-rsi-cod-button], ._rsi-buy-now-button-app-block-hook button';
const onCartPage = () => /\/cart\/?$/.test(location.pathname);

/** Formulario del producto de la página: el mismo que abre nuestro botón fijo. */
function openProductForm(): boolean {
  const host = [...document.querySelectorAll<HTMLElement>('[data-cod-form][data-cod-rendered="button"]')]
    .find((el) => el.dataset.cart !== 'true' && el.shadowRoot?.querySelector('.cod-trigger'));
  const btn = host?.shadowRoot?.querySelector<HTMLElement>('.cod-trigger');
  if (!btn) return false;
  btn.click();
  return true;
}
let cartOpening = false;
async function openCartForm(): Promise<void> {
  if (cartOpening) return;
  cartOpening = true;
  try {
    const lines = await readCart();
    if (!lines.length) return;
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.productId)) continue;
      seen.add(l.productId);
      let config: WidgetConfig;
      try { config = await api.config(l.productId, l.variantId); } catch { continue; }
      openModal(null, config, (root) => renderCartInto(root, config));
      try { api.track(config.formId, 'view', config.formVersionId); } catch { /* no bloquea */ }
      fireCheckoutPixel(config);
      return;
    }
  } catch { /* sin carrito: no se abre nada */ } finally {
    cartOpening = false;
  }
}

/** Modal para el modo popup. El formulario se monta fresco cada apertura. */
function openModal(shadow: ShadowRoot | null, config: WidgetConfig, renderInto: (el: HTMLElement) => void): void {
  // La ventana va en su propio contenedor AL FINAL DE LA PÁGINA (no dentro de la
  // sección del tema): las animaciones/transformaciones del tema podían dejarla
  // atrapada debajo de otras capas («se ve pero no se puede tocar»).
  document.querySelectorAll('[data-cod-modal]').forEach((el) => el.remove());
  const portal = document.createElement('div');
  portal.setAttribute('data-cod-modal', '');
  portal.style.cssText = 'position:fixed;inset:0;z-index:2147483600;';
  const pshadow = portal.attachShadow({ mode: 'open' });
  // Los mismos estilos (y colores del diseño) que el botón que la abrió.
  if (shadow) shadow.querySelectorAll('style').forEach((st) => pshadow.appendChild(st.cloneNode(true)));
  else {
    const st = document.createElement('style');
    st.textContent = `:host{${tokensToCss(config.tokens)}}\n${CSS}\n${config.tokens.customCss}`;
    pshadow.appendChild(st);
  }
  document.body.appendChild(portal);

  const overlay = document.createElement('div');
  overlay.className = `cod-modal-overlay cod-mode-${config.tokens.display ?? 'sheet'}`;
  // La capa sigue la parte visible de la pantalla (cambia al abrir el teclado).
  const vv = window.visualViewport;
  // Una sola escritura por cuadro y solo si cambió (el scroll dispara muchísimos eventos).
  let fitTop = -1, fitH = -1, fitRaf = 0;
  const fit = () => {
    if (!vv || fitRaf) return;
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      const t = Math.round(vv.offsetTop), h = Math.round(vv.height);
      if (t !== fitTop) { fitTop = t; overlay.style.setProperty('--cod-vv-top', `${t}px`); }
      if (h !== fitH) { fitH = h; overlay.style.setProperty('--cod-vv-h', `${h}px`); }
    });
  };
  if (vv) { fitTop = Math.round(vv.offsetTop); fitH = Math.round(vv.height); overlay.style.setProperty('--cod-vv-top', `${fitTop}px`); overlay.style.setProperty('--cod-vv-h', `${fitH}px`); }
  vv?.addEventListener('resize', fit, { passive: true });
  vv?.addEventListener('scroll', fit, { passive: true });
  const pausedHosts = [...document.querySelectorAll<HTMLElement>('[data-cod-form]')];
  pausedHosts.forEach((h) => h.setAttribute('data-cod-paused', ''));

  const modal = document.createElement('div');
  modal.className = 'cod-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `<div class="cod-modal-head"><span class="cod-modal-title">${(config.tokens.submit.text || '').replace(/[<>&"]/g, '')}</span>`
    + `<button type="button" class="cod-modal-close" aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
    + `<div class="cod-modal-body"></div>`;
  overlay.appendChild(modal);
  pshadow.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('cod-open'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.remove('cod-open');
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', esc);
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    if (fitRaf) cancelAnimationFrame(fitRaf);
    pausedHosts.forEach((h) => h.removeAttribute('data-cod-paused'));
    setTimeout(() => portal.remove(), 250);
  };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  modal.querySelector('.cod-modal-close')!.addEventListener('click', close);
  document.addEventListener('keydown', esc);

  const formRoot = document.createElement('div');
  formRoot.className = 'cod-root';
  modal.querySelector<HTMLElement>('.cod-modal-body')!.appendChild(formRoot);
  renderInto(formRoot);
}

export interface QuoteInput {
  formId: string; variantId: string; qty: number;
  province: string | null; discountCode: string | null; addonIds: string[];
  cart?: { variantId: string; qty: number }[];
  cartToken?: string;
  cartTotalCents?: number;
}

/** Estado del formulario. Deliberadamente simple: sin framework, sin peso. */
export class FormState {
  values: Record<string, string> = {};
  qty = 1;
  /** La cantidad la eligió el cliente en la página (oferta o selector del tema). */
  qtyFromPage = false;
  /** La página tiene su propia caja de ofertas: el formulario no las repite. */
  pageManagesQty = false;
  /** Pedido desde el carrito: todas sus líneas (si no, el producto del formulario). */
  cart: { variantId: string; qty: number }[] | null = null;
  cartToken = '';
  cartTotalCents = 0;
  private qtyListeners: ((q: number) => void)[] = [];
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

  onQtyChange(fn: (q: number) => void) { this.qtyListeners.push(fn); }

  /** Cambio de cantidad que viene de la página (no de las tarjetas del formulario). */
  setQtyFromPage(q: number): void {
    if (q === this.qty) return;
    this.qty = q;
    this.qtyFromPage = true;
    this.qtyListeners.forEach((fn) => fn(q));
  }

  private quoteInput(discountCode = this.discountCode): QuoteInput {
    return {
      formId: this.config.formId,
      variantId: this.config.product.variantId,
      qty: this.qty,
      province: this.values.province || this.values.provinceCode || null,
      discountCode,
      addonIds: this.acceptedAddons.map((a) => a.id),
      ...(this.cart ? { cart: this.cart, cartToken: this.cartToken, cartTotalCents: this.cartTotalCents } : {}),
    };
  }

  /** Recotiza (con pausa de 300 ms) solo si cambió algo que afecta al precio. */
  private quoteSeq = 0;
  requestQuote(): void {
    const key = JSON.stringify(this.quoteInput());
    if (key === this.quoteKey) return;
    this.quoteKey = key;
    window.clearTimeout(this.quoteTimer);
    this.quoteTimer = window.setTimeout(() => {
      // Solo vale la respuesta de la ÚLTIMA cotización: en el móvil pueden llegar
      // desordenadas y el botón mostraría un total viejo (p. ej. con un extra ya quitado).
      const seq = ++this.quoteSeq;
      this.quoter(this.quoteInput())
        .then((q) => { if (seq !== this.quoteSeq) return; this.quote = q; this.quoteListeners.forEach((fn) => fn(q)); })
        .catch(() => { if (seq === this.quoteSeq) this.quoteKey = ''; /* el precio es informativo: nunca bloquea */ });
    }, 120);
  }

  /** Valida un código en el servidor. Devuelve la cotización con o sin el descuento aplicado. */
  async applyDiscount(code: string | null): Promise<QuoteResponse> {
    const seq = ++this.quoteSeq;
    window.clearTimeout(this.quoteTimer);
    const q = await this.quoter(this.quoteInput(code));
    if (seq !== this.quoteSeq) return q;
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

  // Los extras que se envían son EXACTAMENTE los que el cliente ve marcados.
  const addonEls = root.querySelectorAll<HTMLElement>('[data-addon-id]');
  if (addonEls.length) {
    const on = new Set([...addonEls]
      .filter((el) => el.classList.contains('cod-upsell-on') || !!el.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)
      .map((el) => el.dataset.addonId!));
    state.acceptedAddons = config.addons.filter((a) => on.has(a.id)).map((a) => ({ id: a.id, variantId: a.variantId, qty: a.qty }));
  }

  const payload: SubmitRequest = {
    formId: config.formId,
    formVersionId: config.formVersionId,
    idempotencyKey: state.idempotencyKey,
    variantId: config.product.variantId,
    qty: state.qty,
    discountCode: state.discountCode,
    acceptedAddons: state.acceptedAddons,
    fields: state.values,
    ...(state.cart ? { cart: state.cart, cartToken: state.cartToken, cartTotalCents: state.cartTotalCents } : {}),
    location: state.location,
    startedAt: state.startedAt,
    hp: '', // honeypot: si un bot lo rellena, el backend rechaza
    attribution: metaAttribution(),
  };

  try {
    const res = await api.submit(payload);
    if (state.cart) clearCart();
    try { api.track(config.formId, 'submit_attempt', state.idempotencyKey); } catch { /* no bloquea */ }
    showConfirmation(root, res, state.idempotencyKey);
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
 * El texto (título y mensaje) se edita desde Figui («Después del pedido»).
 *
 * Destino, según lo que eligió la tienda:
 *   - 'whatsapp' → abre WhatsApp con el mensaje ya escrito y la página queda en
 *                  «Estado del pedido»: si el cliente vuelve al navegador, está ahí.
 *   - 'thankyou' → la página «Estado del pedido» de Shopify (o la de gracias si
 *                  el pedido aún no está listo).
 *   - 'none'     → se queda en la confirmación.
 * Sin botones: todo pasa solo.
 */
function showConfirmation(root: HTMLElement, res: import('@cod/contracts').SubmitResponse, key: string): void {
  const goWhatsapp = res.redirectTarget === 'whatsapp' && !!res.whatsappUrl;
  const willRedirect = goWhatsapp || res.redirectTarget === 'thankyou';

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
      ${res.message ? `<p>${escapeHtml(res.message)}</p>` : ''}
      ${willRedirect
        ? `<div class="cod-done-bar"><span style="animation-duration:${res.redirectDelayMs}ms"></span></div>`
        : ''}
    </div>`;

  root.querySelector('.cod-done')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!willRedirect) return;

  // El pedido se crea en Shopify en 1-2 segundos: mientras corre la barra se
  // pide el enlace de «Estado del pedido».
  const statusUrl = waitForStatusUrl(res.submissionId, key, Math.max(res.redirectDelayMs, 2500) + 6000);
  const delay = new Promise((r) => window.setTimeout(r, res.redirectDelayMs));

  void Promise.all([statusUrl.peek(Math.max(res.redirectDelayMs, 2500)), delay]).then(([url]) => {
    if (!goWhatsapp) {
      window.location.assign(url || res.redirectUrl);
      return;
    }
    // WhatsApp + «Estado del pedido»: al volver al navegador, el cliente queda ahí.
    const toStatus = (u: string | null) => {
      if (!u) return;
      try {
        const t = new URL(u, location.href);
        // Mismo dominio: la entrada actual del historial pasa a ser «Estado del pedido».
        if (t.origin === location.origin) history.replaceState(history.state, '', t.pathname + t.search + t.hash);
      } catch { /* sin cambios */ }
      // Volvió de WhatsApp a esta pestaña (o con «atrás»): se muestra el estado del pedido.
      let wasHidden = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') wasHidden = true;
        else if (wasHidden) window.location.replace(u);
      });
      window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.replace(u); });
    };
    if (url) toStatus(url);
    else void statusUrl.done.then(toStatus);
    window.location.assign(res.whatsappUrl!);
  });
}

/** Pregunta por el enlace de «Estado del pedido» hasta que exista (o se acabe el tiempo). */
function waitForStatusUrl(submissionId: string, key: string, maxMs: number): {
  done: Promise<string | null>;
  peek: (ms: number) => Promise<string | null>;
} {
  const until = Date.now() + maxMs;
  const done = (async () => {
    while (Date.now() < until) {
      try {
        const r = await api.orderStatus(submissionId, key);
        if (r.ready && r.url) return r.url;
      } catch { /* se reintenta */ }
      await new Promise((r) => window.setTimeout(r, 700));
    }
    return null;
  })();
  return {
    done,
    peek: (ms) => Promise.race([done, new Promise<null>((r) => window.setTimeout(() => r(null), ms))]),
  };
}

/** Cookies de Meta (_fbp/_fbc) y la página: así Meta une la compra con el anuncio. */
function metaAttribution(): { fbp?: string; fbc?: string; url?: string } {
  try {
    const ck = (n: string) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.slice(n.length + 1);
    let fbc = ck('_fbc');
    const fbclid = new URLSearchParams(location.search).get('fbclid');
    if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    return { fbp: ck('_fbp') || undefined, fbc: fbc || undefined, url: location.href.slice(0, 1000) };
  } catch {
    return {};
  }
}

/** Carga el píxel de Meta si el tema no lo tiene (solo con el ID que puso la tienda). */
function ensureFbq(pixelId: string): ((...a: unknown[]) => void) | null {
  const w = window as unknown as { fbq?: (...a: unknown[]) => void; __codFbqInit?: Record<string, boolean> };
  if (!w.fbq) {
    (function (f: any, b, e, v) {
      if (f.fbq) return; const n: any = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      const t = b.createElement(e) as HTMLScriptElement; t.async = true; t.src = v;
      const s = b.getElementsByTagName(e)[0]!; s.parentNode!.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  }
  w.__codFbqInit ??= {};
  if (!w.__codFbqInit[pixelId]) { w.__codFbqInit[pixelId] = true; w.fbq!('init', pixelId); }
  return w.fbq ?? null;
}

/** «Inicio de pago» en Meta al abrir el formulario (una vez por página). */
let checkoutFired = false;
function fireCheckoutPixel(config: WidgetConfig): void {
  try {
    const id = config.settings.tracking.metaPixelId;
    if (!id || checkoutFired) return;
    checkoutFired = true;
    ensureFbq(id)?.('track', 'InitiateCheckout', { currency: config.settings.currency, value: (config.product?.unitPriceCents ?? 0) / 100 });
  } catch { /* nunca bloquea el formulario */ }
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
      ensureFbq(p.metaPixelId)?.('track', p.eventName, { currency: p.currency, value }, { eventID: p.eventId });
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
  placeCartButtons();
  const manualShown = () => fixedHosts().some((el) => !el.dataset.codAuto && el.getClientRects().length > 0);
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

/** Botones «Pagar» / «Checkout» del tema (página del carrito y carrito lateral). */
const CHECKOUT = 'button[name="checkout"], input[name="checkout"], button#checkout, a[href$="/checkout"]';

/**
 * Botón del carrito: debajo del botón de pagar del tema, en la página del
 * carrito y en el carrito lateral. Abre el formulario con TODO el carrito.
 */
function placeCartButtons(): void {
  if (!DIRECT?.cartButton) return;
  if (onCartPage()) placeOnCartPage();
  document.querySelectorAll<HTMLElement>(CHECKOUT).forEach((btn) => {
    if (btn.closest('[data-cod-form], [data-cod-modal]')) return;
    // Si el botón va en una fila (junto a otros), el nuestro va debajo de la fila.
    const parent = btn.parentElement;
    const row = parent && parent.tagName !== 'FORM' && getComputedStyle(parent).display.includes('flex')
      && !getComputedStyle(parent).flexDirection.startsWith('column');
    const anchor = row ? parent! : btn;
    const next = anchor.nextElementSibling as HTMLElement | null;
    if (next?.dataset.cart === 'true') return;
    // Un solo botón nuestro por contenedor (algunos temas tienen dos «Pagar»).
    if (anchor.parentElement?.querySelector(':scope > [data-cod-form][data-cart="true"]')) return;
    const el = document.createElement('div');
    el.setAttribute('data-cod-form', '');
    el.dataset.mode = 'popup';
    el.dataset.cart = 'true';
    el.style.cssText = 'display:block;width:100%;margin:10px 0 0;';
    anchor.insertAdjacentElement('afterend', el);
  });
}

/**
 * Página del carrito sin botón «Pagar» propio (temas hechos para otra app de
 * pago contra entrega): nuestro botón va debajo del TOTAL del carrito, donde
 * esa app ponía el suyo. Si la otra app sigue puesta y muestra su botón, no se
 * duplica: ese botón ya abre este formulario.
 */
function placeOnCartPage(): void {
  const shown = (e: Element) => e.getClientRects().length > 0;
  const ours = document.querySelector<HTMLElement>('[data-cod-cart-page]');
  const theirs = [...document.querySelectorAll(RELEASIT)].some((b) => shown(b) && !b.closest('[data-cod-form]'));
  const checkout = [...document.querySelectorAll(CHECKOUT)].some((b) => shown(b) && !b.closest('[data-cod-form], [data-cod-modal]'));
  if (theirs || checkout) { ours?.remove(); return; }
  if (ours?.isConnected) return;
  const total = document.querySelector('[data-mc-total], .mc-total__val, .totals__total-value, [data-cart-total], .cart__total, .cart-subtotal__price');
  // El hueco donde iba el botón de la otra app; si no, debajo de la fila del total.
  const anchor = document.querySelector<HTMLElement>('.rsi-app-block-container')?.closest<HTMLElement>('.mc-appblock')
    ?? document.querySelector<HTMLElement>('.rsi-app-block-container')
    ?? document.querySelector<HTMLElement>('.mc-summary .mc-total')
    ?? total?.parentElement?.closest<HTMLElement>('.mc-total, .totals, .cart__totals, .cart-subtotal, .totals__total')
    ?? total?.parentElement
    ?? null;
  if (!anchor) return;
  const el = document.createElement('div');
  el.setAttribute('data-cod-form', '');
  el.dataset.mode = 'popup';
  el.dataset.cart = 'true';
  el.dataset.codCartPage = '1';
  el.style.cssText = 'display:block;width:100%;margin:14px 0 4px;';
  anchor.insertAdjacentElement('afterend', el);
}

/**
 * Cantidad elegida en la página del producto (selector del tema o su propia
 * caja de ofertas, que suelen escribir en el campo «quantity» del formulario
 * de compra). null si la página no tiene.
 */
export function pageQuantity(variantId: string): number | null {
  return pageQuantityInfo(variantId)?.qty ?? null;
}

/**
 * Además dice si la cantidad la maneja una caja de ofertas del tema (campo
 * oculto): entonces manda siempre, también cuando el cliente elige 1.
 */
export function pageQuantityInfo(variantId: string): { qty: number; managed: boolean } | null {
  // 1) La caja de ofertas del tema («1 unidad · 2 unidades · 3 unidades» con
  //    precios): la opción marcada manda. No depende de campos escondidos de
  //    otras apps (antes solo funcionaba porque otra app dejaba uno).
  const fromBox = offerBoxQty();
  if (fromBox) return { qty: fromBox, managed: true };
  const variant = variantId.replace(/\D/g, '');
  const forms = [...document.querySelectorAll<HTMLFormElement>('form[action*="/cart/add"]')]
    .filter((f) => !f.closest('[data-cod-form]') && !f.closest(CARD) && f.querySelector('[name="quantity"]'));
  const idOf = (f: HTMLFormElement) => f.querySelector<HTMLInputElement | HTMLSelectElement>('[name="id"]')?.value ?? '';
  const form = forms.find((f) => idOf(f) === variant)
    ?? forms.find((f) => f.closest('main, #MainContent, [id*="main"], [id*="product-information"], [id*="product-template"]'))
    ?? null;
  const input = form?.querySelector<HTMLInputElement | HTMLSelectElement>('[name="quantity"]');
  const q = Math.floor(Number(input?.value));
  if (!input || !Number.isFinite(q) || q < 1 || q > 99) return null;
  return { qty: q, managed: input instanceof HTMLInputElement && input.type === 'hidden' };
}

/** Opción (radio) de una caja de ofertas: cantidad numérica con un precio en su etiqueta. */
function offerRadio(el: Element | null): HTMLInputElement | null {
  if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !/^\d{1,2}$/.test(el.value)) return null;
  if (el.closest('[data-cod-form], [data-cod-modal]')) return null;
  const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${window.CSS.escape(el.id)}"]`) : null) ?? el.parentElement;
  return label && /(RD\s?\$|US\s?\$|\$|€|£)\s?\d/.test(label.textContent ?? '') ? el : null;
}

/** La última oferta que el cliente marcó en la página (o la marcada de inicio). */
let lastOfferQty: number | null = null;
document.addEventListener('change', (e) => {
  const r = offerRadio(e.target as Element);
  if (r?.checked) lastOfferQty = Number(r.value);
}, true);

function offerBoxQty(): number | null {
  if (lastOfferQty && lastOfferQty >= 1 && lastOfferQty <= 50) return lastOfferQty;
  const checked = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')]
    .map(offerRadio).filter((r): r is HTMLInputElement => !!r && !r.closest(CARD));
  const r = checked.find((x) => (x.closest('label') ?? x).getClientRects().length > 0) ?? checked[0];
  const q = r ? Number(r.value) : 0;
  return q >= 1 && q <= 50 ? q : null;
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
  // Sin formulario de compra (temas que usaban otra app): debajo de la caja de ofertas.
  const radio = [...document.querySelectorAll('input[type="radio"]')].map(offerRadio)
    .find((r) => r && !r.closest(CARD) && shown(r.closest('label') ?? r));
  const box = radio?.closest<HTMLElement>('[data-pd-offers]') ?? radio?.closest<HTMLElement>('fieldset, [role="radiogroup"]');
  if (box) return box;
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
    if (el.dataset.cart === 'true') { void mountCart(el); return; }
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

/**
 * Botón del carrito: el formulario se busca con un producto del carrito (el
 * primero que tenga formulario). Carrito vacío: no se muestra nada.
 */
async function mountCart(el: HTMLElement): Promise<void> {
  let lines: ShopCartLine[];
  try { lines = await readCart(); } catch { el.remove(); return; }
  if (!lines.length) { el.style.display = 'none'; return; }
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.productId)) continue;
    seen.add(l.productId);
    try {
      await api.config(l.productId, l.variantId);
    } catch { continue; }
    el.dataset.productId = l.productId;
    el.dataset.variantId = l.variantId;
    if (!el.isConnected) return;
    await mount({ productId: l.productId, variantId: l.variantId, container: el });
    return;
  }
  el.remove();
}

if (DIRECT?.cartButton) {
  document.addEventListener('click', (e) => {
    const el = e.target as Element | null;
    const cartBtn = el?.closest?.(CART_TRIGGERS);
    const rsiBtn = cartBtn ? null : el?.closest?.(RELEASIT);
    if ((!cartBtn && !rsiBtn) || el?.closest?.('[data-cod-modal]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Ya está abierto: el tema a veces «pulsa» el botón solo varias veces; no se
    // vuelve a abrir (se perdería lo que el cliente está escribiendo).
    if (document.querySelector('[data-cod-modal]')) return;
    // En la página del carrito o con el carrito lateral abierto (un botón de otra
    // app puede quedar ENCIMA del carrito): TODO el carrito.
    // Botón de Releasit en la página de un producto: el formulario de ese producto.
    const fromCart = !!cartBtn || onCartPage() || overlayOpen() || cartOpen()
      || !!el?.closest?.('#pd-cart, .pd-panel, cart-drawer, cart-notification, [id*="CartDrawer"], [class*="cart-drawer"]');
    if (fromCart || !openProductForm()) void openCartForm();
  }, true);
  // Llegó a la página del carrito para pagar contra entrega (/cart?pd_cod=1).
  if (/\/cart\/?$/.test(location.pathname) && /[?&](pd_)?cod=1\b/.test(location.search)) {
    window.setTimeout(() => void openCartForm(), 600);
  }
}

// El cargador pone el botón cuando sabe el producto: lo monta al instante.
if (DIRECT) (DIRECT as { boot?: () => void }).boot = boot;

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
      // Carrito lateral que se vuelve a dibujar (al añadir un producto): su «Pagar» nuevo.
      if (DIRECT?.cartButton && n instanceof HTMLElement && (n.matches(CHECKOUT) || n.querySelector(CHECKOUT))) { queueBoot(); return; }
      // Página del carrito que se redibuja (al cambiar cantidades) o botón de otra app que aparece.
      if (DIRECT?.cartButton && n instanceof HTMLElement && onCartPage()) { queueBoot(); return; }
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('shopify:section:load', queueBoot);

window.CodForm = { mount };
