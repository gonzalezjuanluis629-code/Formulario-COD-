import type { Addon, Field, Offer, ThemeTokens, WidgetConfig } from '@cod/contracts';
import { tokensToCss } from './core/theme';
import { renderForm } from './ui/form';
import { CSS } from './ui/styles';
import { FormState } from './index';
import { renderTrigger } from './ui/trigger';
import { quote } from '@cod/pricing';

export interface PreviewOptions {
  /** Campo seleccionado en el editor: se resalta en la vista previa. */
  selectedKey?: string | null;
  /** Muestra también el botón «Comprar ahora» (modo popup) encima del formulario. */
  showTrigger?: boolean;
  /** Se llama al hacer clic en un campo de la vista previa. */
  onSelect?: (key: string) => void;
  /** Ofertas por cantidad y extras a mostrar (los del panel). */
  offers?: Offer[];
  addons?: Addon[];
  /** Precio del producto de ejemplo, en centavos. */
  unitPriceCents?: number;
  /** Envío y recargo REALES de la tienda (página «Envíos»). Sin dato = sin envío. */
  shipping?: { defaultShippingCents: number; freeShippingOverCents: number | null; codFeeCents: number } | null;
  /** Zona a la que llevar la vista (al editar ofertas o extras). */
  focus?: 'offers' | 'addons' | null;
}

let lastFocus: string | null = null;

/* Estado entre renders: la vista previa se actualiza por partes para no «pestañear». */
let lastSelected: string | null = null;
let lastFormKey = '';
let lastTriggerKey = '';
let currentOnSelect: PreviewOptions['onSelect'];
const PREVIEW_CSS = `
.cod-field{position:relative;cursor:pointer;border-radius:8px;transition:box-shadow .15s}
.cod-field:hover{box-shadow:0 0 0 2px rgba(0,91,211,.25)}
.cod-field.cod-selected{box-shadow:0 0 0 2px #005bd3}
.cod-field.cod-selected.cod-hidden{display:block;opacity:.6}
.cod-static .cod-field{animation:none}
.cod-field.cod-selected::before{content:attr(data-label);position:absolute;top:-9px;right:6px;z-index:2;
  background:#005bd3;color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px}`;

/**
 * Modo demo del widget: mismo renderizador, mismos estilos, misma validación.
 * Lo único que cambia es que no hay backend detrás.
 *
 * Esto es deliberado: una preview que "imita" el formulario acaba mintiendo.
 * Reutilizando el código real, lo que ve el merchant es lo que verá el cliente.
 */
export function renderPreview(host: HTMLElement, fields: Field[], tokens: ThemeTokens, opts: PreviewOptions = {}): void {
  currentOnSelect = opts.onSelect;
  renderTriggerPreview(host, tokens, !!opts.showTrigger);

  const firstTime = !host.shadowRoot;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  if (firstTime) {
    host.textContent = '';
    shadow.appendChild(document.createElement('style'));
    // Un solo listener: clic en cualquier campo → se edita en el panel.
    shadow.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.cod-field[data-key]');
      if (el) currentOnSelect?.(el.dataset.key!);
    });
  }

  // 1) Colores, tamaños, esquinas, degradados: solo CSS, sin redibujar.
  const style = shadow.querySelector('style')!;
  const css = `:host{${tokensToCss(tokens)}}\n${CSS}\n${tokens.customCss}\n${PREVIEW_CSS}`;
  if (style.textContent !== css) style.textContent = css;

  // 2) Los campos y textos se redibujan SOLO si cambiaron, y sin animación de entrada.
  const formKey = JSON.stringify([fields, tokens.progressBar, tokens.submit.text, tokens.submit.iconType,
    tokens.submit.icon, tokens.submit.priceDisplay, tokens.offerCard.showCompare, tokens.offerCard.showSave, tokens.offerCard.showInForm,
    opts.offers ?? [], opts.addons ?? [], opts.unitPriceCents ?? 0, opts.shipping ?? null]);
  let root = shadow.querySelector<HTMLElement>('.cod-root');
  if (formKey !== lastFormKey || !root) {
    lastFormKey = formKey;
    const next = document.createElement('div');
    next.className = root ? 'cod-root cod-static' : 'cod-root';
    buildForm(next, fields, tokens, opts);
    if (root) shadow.replaceChild(next, root); else shadow.appendChild(next);
    root = next;
  }

  // Animación del botón: solo se cambia su clase, sin redibujar nada.
  const btn = root.querySelector<HTMLElement>('.cod-submit');
  if (btn) {
    const cls = `cod-submit-anim-${tokens.submit.animation}`;
    if (!btn.classList.contains(cls)) {
      btn.className = btn.className.replace(/\bcod-submit-anim-\S+/g, '').trim() + ' ' + cls;
    }
  }

  // Lleva la vista a las ofertas o a los extras cuando se están editando.
  if (opts.focus && opts.focus !== lastFocus) {
    const target = root.querySelector(opts.focus === 'offers' ? '.cod-offers-slot' : '.cod-addons-slot');
    window.setTimeout(() => target?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  }
  lastFocus = opts.focus ?? null;

  // 3) Selección: solo cambia el resaltado.
  markSelection(root, fields, opts.selectedKey ?? null);
}

function buildForm(root: HTMLElement, fields: Field[], tokens: ThemeTokens, opts: PreviewOptions): void {
  const config: WidgetConfig = {
    formId: 'preview',
    formVersionId: 'preview',
    displayMode: 'EMBEDDED',
    fields,
    tokens,
    location: {
      enabled: true, gpsEnabled: true, manualEnabled: true, requireLocation: false,
      lockAfterCapture: true, defaultCenter: { lat: 18.4861, lng: -69.9312 }, defaultZoom: 17,
      gpsLabel: 'Usar mi ubicación actual', gpsHint: 'Tomada del mapa, precisa',
      manualLabel: 'Escribirla', manualHint: 'La escribes tú mismo',
    },
    settings: {
      thankYouUrl: '/pages/gracias', redirectDelayMs: 3000, orderTag: 'COD',
      gateway: 'Cash on Delivery (COD)', currency: 'DOP',
      freeShippingOverCents: opts.shipping?.freeShippingOverCents ?? null,
      defaultShippingCents: opts.shipping?.defaultShippingCents ?? 0,
      shippingByProvince: {}, codFeeCents: opts.shipping?.codFeeCents ?? 0, codFeeLabel: 'Recargo contra entrega',
      showOrderSummaryToCustomer: false,
      confirmation: {
        title: '¡Pedido confirmado!',
        message: 'Te contactamos por WhatsApp para coordinar la entrega.',
        redirectTarget: 'none',
        whatsapp: { enabled: false, phone: '', messageTemplate: '' },
      },
      antifraud: {
        holdHighRisk: false, riskThreshold: 50, maxOrdersPerPhonePerDay: 0,
        turnstileSiteKey: '', turnstileSecret: '',
      },
      tracking: {
        metaPixelId: '', metaCapiToken: '', metaTestCode: '', tiktokPixelId: '', tiktokToken: '',
        ga4MeasurementId: '', ga4ApiSecret: '', purchaseEventName: 'Purchase',
      },
      storefront: { autoPlace: true, floating: true, cartButton: true },
    },
    offers: opts.offers ?? [],
    addons: opts.addons ?? [],
    product: { variantId: 'preview', title: 'Producto de ejemplo', unitPriceCents: opts.unitPriceCents || 189000, image: null },
  };

  const state = new FormState(config);
  // Sin tienda detrás: precio de ejemplo y cualquier código vale un 10 % de muestra.
  state.quoter = async (r) => quote({
    qty: r.qty,
    unitPriceCents: config.product.unitPriceCents,
    currency: config.settings.currency,
    offers: config.offers,
    defaultShippingCents: config.settings.defaultShippingCents,
    freeShippingOverCents: config.settings.freeShippingOverCents,
    codFeeCents: config.settings.codFeeCents,
    addonsCents: state.acceptedAddons.reduce((sum, x) => {
      const a = config.addons.find((y) => y.id === x.id);
      return sum + (a ? a.priceCents * a.qty : 0);
    }, 0),
    discount: r.discountCode
      ? { code: r.discountCode.toUpperCase(), source: 'APP', label: 'Ejemplo', kind: 'PERCENTAGE', valueBps: 1000 }
      : null,
  });

  renderForm(root, config, state, {
    onSubmit: () => {
      // En preview no se crea nada: se enseña la pantalla final tal cual la verá el cliente.
      root.innerHTML = `
        <div class="cod-done">
          <div class="cod-done-tick">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"
                 stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3>¡Pedido confirmado!</h3>
          <p>Te contactamos por WhatsApp para coordinar la entrega.</p>
          <div class="cod-done-bar"><span style="animation-duration:3000ms"></span></div>
          <small>Vista previa — sin resumen, tal como lo verá el cliente</small>
        </div>`;
    },
  });

}

/** Resalta el campo elegido (y lo trae a la vista si cambió). */
function markSelection(root: HTMLElement, fields: Field[], selectedKey: string | null): void {
  const names = new Map(fields.map((f) => [f.key, f.label || f.content || f.key]));
  root.querySelectorAll<HTMLElement>('.cod-field[data-key]').forEach((el) => {
    el.dataset.label = (names.get(el.dataset.key!) ?? '').slice(0, 40);
    el.classList.toggle('cod-selected', el.dataset.key === selectedKey);
  });
  if (selectedKey && selectedKey !== lastSelected) {
    root.querySelector('.cod-selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  lastSelected = selectedKey;
}

/** Botón «Comprar ahora» encima del formulario, igual que en la tienda en modo popup. */
function renderTriggerPreview(host: HTMLElement, tokens: ThemeTokens, show: boolean): void {
  let box = document.getElementById('cod-trigger-preview');
  if (!show) { box?.remove(); lastTriggerKey = ''; return; }
  const key = JSON.stringify(tokens.trigger);
  if (box && key === lastTriggerKey) return;
  lastTriggerKey = key;
  if (!box) {
    box = document.createElement('div');
    box.id = 'cod-trigger-preview';
    box.style.cssText = 'margin:0 auto 16px;max-width:420px';
    host.parentElement?.insertBefore(box, host);
  }
  box.innerHTML = '<div style="font:600 11px system-ui;color:#8a8a8a;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">Botón «Comprar ahora»</div>';
  const slot = document.createElement('div');
  box.appendChild(slot);
  renderTrigger(slot, tokens.trigger, () => undefined);
}
