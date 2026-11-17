import type { Field, ThemeTokens, WidgetConfig } from '@cod/contracts';
import { tokensToCss } from './core/theme';
import { renderForm } from './ui/form';
import { CSS } from './ui/styles';
import { FormState } from './index';
import { renderTrigger } from './ui/trigger';

export interface PreviewOptions {
  /** Campo seleccionado en el editor: se resalta en la vista previa. */
  selectedKey?: string | null;
  /** Muestra también el botón «Comprar ahora» (modo popup) encima del formulario. */
  showTrigger?: boolean;
  /** Se llama al hacer clic en un campo de la vista previa. */
  onSelect?: (key: string) => void;
}

let lastSelected: string | null = null;

const PREVIEW_CSS = `
.cod-field{position:relative;cursor:pointer;border-radius:8px;transition:box-shadow .15s}
.cod-field:hover{box-shadow:0 0 0 2px rgba(0,91,211,.25)}
.cod-field.cod-selected{box-shadow:0 0 0 2px #005bd3}
.cod-field.cod-selected.cod-hidden{display:block;opacity:.6}
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
  host.textContent = '';
  renderTriggerPreview(host, tokens, !!opts.showTrigger);

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `:host{${tokensToCss(tokens)}}\n${CSS}\n${tokens.customCss}\n${PREVIEW_CSS}`;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'cod-root';
  shadow.appendChild(root);

  const config: WidgetConfig = {
    formId: 'preview',
    formVersionId: 'preview',
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
      freeShippingOverCents: 350000, defaultShippingCents: 25000,
      shippingByProvince: {}, codFeeCents: 0, codFeeLabel: 'Recargo contra entrega',
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
    },
    offers: [],
    addons: [],
    product: { variantId: 'preview', title: 'Producto de ejemplo', unitPriceCents: 189000, image: null },
  };

  const state = new FormState(config);

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

  wireSelection(root, fields, opts);
}

/** Resalta el campo elegido y permite elegir campos haciendo clic en la vista previa. */
function wireSelection(root: HTMLElement, fields: Field[], opts: PreviewOptions): void {
  const names = new Map(fields.map((f) => [f.key, f.label || f.content || f.key]));
  root.querySelectorAll<HTMLElement>('.cod-field[data-key]').forEach((el) => {
    const key = el.dataset.key!;
    el.dataset.label = (names.get(key) ?? '').slice(0, 40);
    if (key === opts.selectedKey) el.classList.add('cod-selected');
    el.addEventListener('pointerdown', () => opts.onSelect?.(key));
  });
  if (opts.selectedKey && opts.selectedKey !== lastSelected) {
    root.querySelector('.cod-selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  lastSelected = opts.selectedKey ?? null;
}

/** Botón «Comprar ahora» encima del formulario, igual que en la tienda en modo popup. */
function renderTriggerPreview(host: HTMLElement, tokens: ThemeTokens, show: boolean): void {
  let box = document.getElementById('cod-trigger-preview');
  if (!show) { box?.remove(); return; }
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
