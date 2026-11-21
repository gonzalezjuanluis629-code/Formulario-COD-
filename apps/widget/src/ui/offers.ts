import type { Offer, WidgetConfig } from '@cod/contracts';
import { provinceAllows } from '@cod/contracts';
import { money } from '@cod/pricing';
import type { FormState } from '../index';

/**
 * Tarjetas de cantidad: «1 unidad · RD$1,799» / «2 unidades · RD$2,950 (tachado
 * RD$3,598) · Ahorras 18 % · MÁS VENDIDO». El precio que se ve es una estimación
 * con el precio del producto; el que se cobra lo recalcula SIEMPRE el servidor.
 */
export function renderOffers(host: HTMLElement, config: WidgetConfig, state: FormState, onChange: () => void): void {
  // Solo las que se ofrecen en la provincia del cliente.
  const list = [...config.offers].filter((o) => provinceAllows(o.provinces, state.province())).sort((a, b) => a.minQty - b.minQty);
  if (!list.some((o) => o.minQty > 1)) {
    // La oferta elegida dejó de valer en esta provincia: vuelve a 1 unidad.
    if (state.qty > 1 && !state.qtyFromPage) state.qty = 1;
    return;
  }
  // La página ya tiene su caja de ofertas (o el comerciante las ocultó): no se
  // repiten. El precio de la oferta se aplica igual con la cantidad de la página.
  if (state.pageManagesQty || config.tokens.offerCard.showInForm === false) return;

  // Precio de la variante elegida (sigue la talla/color que el cliente marque en la página).
  const unit = state.unitPriceCents;
  const cur = config.settings.currency;
  const style = config.tokens.offerCard;

  // La de 1 unidad: si el comerciante la configuró, se usa; si no, una básica.
  const base: Offer = list.find((o) => o.minQty === 1) ?? {
    id: 'base', type: 'QUANTITY', minQty: 1, discountBps: 0, freeShipping: false, label: '1 unidad',
    title: '', subtitle: '', badge: '', bundlePriceCents: null, discountCents: 0, productIds: [], preselected: false,
    provinces: { mode: 'all', codes: [] },
  };
  const cards = [base, ...list.filter((o) => o.minQty > 1)];

  // La tarjeta elegida ya no sale (otra provincia): se vuelve a la marcada o a 1 unidad.
  if (!state.qtyFromPage && !cards.some((o) => o.minQty === state.qty)) {
    state.qty = cards.find((o) => o.preselected)?.minQty ?? 1;
  }
  const pre = cards.find((o) => o.preselected);
  // La cantidad elegida en la página manda sobre la tarjeta marcada de inicio.
  // La marcada de inicio solo al abrir: si aparece después (p. ej. al elegir la
  // provincia), no le cambia la cantidad al cliente sin que la toque.
  if (pre && state.qty === 1 && !state.qtyFromPage && !state.preselectDone) state.qty = pre.minQty;
  state.preselectDone = true;

  const wrap = document.createElement('div');
  wrap.className = 'cod-offers';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Cantidad');

  wrap.innerHTML = cards.map((o) => {
    const full = unit * o.minQty;
    const price = o.bundlePriceCents != null
      ? o.bundlePriceCents
      : o.discountCents > 0
        ? Math.max(0, full - o.discountCents)
        : Math.round(full * (1 - o.discountBps / 10000));
    const save = full > 0 && price < full ? Math.round((1 - price / full) * 100) : 0;
    const title = o.title || (o.minQty === 1 ? '1 unidad' : `${o.minQty} unidades`);
    return `
    <button type="button" class="cod-offer${o.badge ? ' cod-offer-has-badge' : ''}" role="radio"
      aria-checked="${o.minQty === state.qty}" data-qty="${o.minQty}">
      ${o.badge ? `<span class="cod-offer-ribbon">${esc(o.badge)}</span>` : ''}
      <span class="cod-offer-dot"></span>
      <span class="cod-offer-text">
        <b>${esc(title)}</b>
        ${o.subtitle ? `<small>${esc(o.subtitle)}</small>` : ''}
        ${style.showSave && save > 0 ? `<span class="cod-offer-save">Ahorras ${save}%</span>` : ''}
        ${o.freeShipping ? '<span class="cod-offer-save">Envío gratis</span>' : ''}
      </span>
      ${unit > 0 ? `<span class="cod-offer-price">
        <b>${money(price, cur)}</b>
        ${style.showCompare && save > 0 ? `<s>${money(full, cur)}</s>` : ''}
      </span>` : ''}
    </button>`;
  }).join('');

  wrap.querySelectorAll<HTMLButtonElement>('.cod-offer').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.qty = Number(btn.dataset.qty) || 1;
      wrap.querySelectorAll('.cod-offer').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      onChange();
    });
  });

  host.appendChild(wrap);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
