import type { WidgetConfig } from '@cod/contracts';
import type { FormState } from '../index';

/**
 * Selector de cantidad con las ofertas del panel ("Compra 2 y ahorra 10 %").
 * Sin totales: el cliente ve la cantidad y el beneficio, nunca el resumen.
 * El descuento real lo calcula SIEMPRE el servidor al enviar.
 */
export function renderOffers(host: HTMLElement, config: WidgetConfig, state: FormState, onChange: () => void): void {
  const offers = [...config.offers].filter((o) => o.minQty > 1).sort((a, b) => a.minQty - b.minQty);
  if (!offers.length) return;

  const options = [
    { qty: 1, title: '1 unidad', badge: '', label: '' },
    ...offers.map((o) => ({
      qty: o.minQty,
      title: `${o.minQty} unidades`,
      badge: o.discountBps > 0 ? `−${trimPct(o.discountBps / 100)} %` : o.freeShipping ? 'Envío gratis' : '',
      label: o.label,
    })),
  ];

  const wrap = document.createElement('div');
  wrap.className = 'cod-offers';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Cantidad');
  wrap.innerHTML = options.map((o) => `
    <button type="button" class="cod-offer" role="radio" aria-checked="${o.qty === state.qty}" data-qty="${o.qty}">
      <span class="cod-offer-dot"></span>
      <span class="cod-offer-text"><b>${esc(o.title)}</b>${o.label && o.label !== o.title ? `<small>${esc(o.label)}</small>` : ''}</span>
      ${o.badge ? `<span class="cod-offer-badge">${esc(o.badge)}</span>` : ''}
    </button>`).join('');

  wrap.querySelectorAll<HTMLButtonElement>('.cod-offer').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.qty = Number(btn.dataset.qty) || 1;
      wrap.querySelectorAll('.cod-offer').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      onChange();
    });
  });

  host.appendChild(wrap);
}

const trimPct = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
