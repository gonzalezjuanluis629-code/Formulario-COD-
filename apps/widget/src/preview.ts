import type { Field, ThemeTokens, WidgetConfig } from '@cod/contracts';
import { tokensToCss } from './core/theme';
import { renderForm } from './ui/form';
import { CSS } from './ui/styles';
import { FormState } from './index';

/**
 * Modo demo del widget: mismo renderizador, mismos estilos, misma validación.
 * Lo único que cambia es que no hay backend detrás.
 *
 * Esto es deliberado: una preview que "imita" el formulario acaba mintiendo.
 * Reutilizando el código real, lo que ve el merchant es lo que verá el cliente.
 */
export function renderPreview(host: HTMLElement, fields: Field[], tokens: ThemeTokens): void {
  host.textContent = '';

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `:host{${tokensToCss(tokens)}}\n${CSS}\n${tokens.customCss}`;
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
      showOrderSummaryToCustomer: false,
    },
    offers: [],
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
}
