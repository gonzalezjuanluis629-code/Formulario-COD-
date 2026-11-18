import type { Addon, WidgetConfig } from '@cod/contracts';
import type { FormState } from '../index';
import { money } from '@cod/pricing';

/**
 * Order bumps, upsells y downsells dentro del formulario.
 *
 * - ORDER_BUMP: casilla de un clic. La forma más efectiva de subir el ticket:
 *   el cliente añade el extra sin salir del flujo.
 * - UPSELL: tarjeta con imagen y precio; botón "Añadir".
 * - DOWNSELL: oculto de inicio. Solo aparece si el cliente RECHAZA su upsell
 *   asociado (replacesId), ofreciéndole una alternativa más barata.
 *
 * Al aceptar/rechazar, se re-cotiza (el servidor pone el precio real) para que
 * el total y el botón reflejen el cambio en vivo.
 */
export function renderAddons(
  host: HTMLElement,
  config: WidgetConfig,
  state: FormState,
  onChange: () => void,
): void {
  const addons = config.addons.filter((a) => a.minCartCents <= config.product.unitPriceCents * state.qty);
  if (!addons.length) return;

  const bumps = addons.filter((a) => a.kind === 'ORDER_BUMP');
  const upsells = addons.filter((a) => a.kind === 'UPSELL');
  const downsells = addons.filter((a) => a.kind === 'DOWNSELL');

  const wrap = document.createElement('div');
  wrap.className = 'cod-addons';

  for (const b of bumps) wrap.appendChild(renderBump(b, state, onChange));
  for (const u of upsells) {
    wrap.appendChild(renderUpsell(u, downsells.find((d) => d.replacesId === u.id) ?? null, state, onChange));
  }

  host.appendChild(wrap);
}

/** Título con **negritas** y {precio}. Se escapa todo antes de dar formato. */
function richTitle(a: Addon): string {
  return esc(a.title)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\{precio\}/gi, `<b>${money(a.priceCents)}</b>`);
}

/** Borde, color de borde y fondo que eligió el comerciante para esta tarjeta. */
function cardStyle(a: Addon): string {
  const st = a.style;
  const border = st.border === 'none' ? 'border:2px solid transparent' : `border:2px ${st.border} ${st.borderColor}`;
  return `${border};background:${st.bg}`;
}

/** Precio aparte solo si el título no lo incluye ya con {precio}. */
function priceTag(a: Addon, cls: string): string {
  if (/\{precio\}/i.test(a.title) || !(a.priceCents > 0)) return '';
  return `<span class="${cls}">${a.compareAtCents ? `<s>${money(a.compareAtCents)}</s>` : ''}${money(a.priceCents)}</span>`;
}

/** Order bump: casilla de un clic («Agrega un segundo producto por solo RD$999»). */
function renderBump(a: Addon, state: FormState, onChange: () => void): HTMLElement {
  const el = document.createElement('label');
  el.className = 'cod-bump';
  el.setAttribute('style', cardStyle(a));
  el.innerHTML = `
    <input type="checkbox">
    <span class="cod-bump-box"></span>
    <span class="cod-bump-text">
      <span class="cod-bump-title">${richTitle(a)}</span>
      ${a.description ? `<small>${esc(a.description)}</small>` : ''}
      ${priceTag(a, 'cod-bump-price')}
    </span>
    ${a.image ? `<img class="cod-bump-img" src="${esc(a.image)}" alt="" loading="lazy">` : ''}`;

  el.querySelector('input')!.addEventListener('change', (e) => {
    toggleAddon(state, a, (e.target as HTMLInputElement).checked);
    el.classList.toggle('cod-bump-on', (e.target as HTMLInputElement).checked);
    onChange();
  });
  return el;
}

/** Upsell: tarjeta con "Añadir" / "Quitar". Al quitar, ofrece el downsell. */
function renderUpsell(a: Addon, downsell: Addon | null, state: FormState, onChange: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cod-upsell';
  el.setAttribute('style', cardStyle(a));
  el.innerHTML = `
    ${a.image ? `<img class="cod-upsell-img" src="${esc(a.image)}" alt="" loading="lazy">` : ''}
    <div class="cod-upsell-body">
      <span class="cod-bump-title">${richTitle(a)}</span>
      ${a.description ? `<small>${esc(a.description)}</small>` : ''}
      ${priceTag(a, 'cod-upsell-price')}
    </div>
    <button type="button" class="cod-upsell-add">Añadir</button>`;

  const btn = el.querySelector<HTMLButtonElement>('.cod-upsell-add')!;
  let added = false;
  let downsellShown = false;

  btn.addEventListener('click', () => {
    added = !added;
    toggleAddon(state, a, added);
    el.classList.toggle('cod-upsell-on', added);
    btn.textContent = added ? 'Quitar' : 'Añadir';

    // Rechazó el upsell y hay un downsell configurado: se le ofrece una vez.
    if (!added && downsell && !downsellShown) {
      downsellShown = true;
      el.insertAdjacentElement('afterend', renderUpsell(downsell, null, state, onChange));
    }
    onChange();
  });
  return el;
}

function toggleAddon(state: FormState, a: Addon, on: boolean): void {
  if (on) {
    if (!state.acceptedAddons.some((x) => x.id === a.id)) {
      state.acceptedAddons.push({ id: a.id, variantId: a.variantId, qty: a.qty });
    }
  } else {
    state.acceptedAddons = state.acceptedAddons.filter((x) => x.id !== a.id);
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
