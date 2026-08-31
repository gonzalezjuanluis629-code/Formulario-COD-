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

/** Order bump: casilla de un clic. */
function renderBump(a: Addon, state: FormState, onChange: () => void): HTMLElement {
  const el = document.createElement('label');
  el.className = 'cod-bump';
  el.innerHTML = `
    <input type="checkbox">
    <span class="cod-bump-box"></span>
    ${a.image ? `<img class="cod-bump-img" src="${esc(a.image)}" alt="">` : ''}
    <span class="cod-bump-text">
      <b>${esc(a.title)}</b>
      ${a.description ? `<small>${esc(a.description)}</small>` : ''}
    </span>
    <span class="cod-bump-price">
      ${a.compareAtCents ? `<s>${money(a.compareAtCents)}</s>` : ''}
      ${money(a.priceCents)}
    </span>`;

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
  el.innerHTML = `
    ${a.image ? `<img class="cod-upsell-img" src="${esc(a.image)}" alt="">` : ''}
    <div class="cod-upsell-body">
      <b>${esc(a.title)}</b>
      ${a.description ? `<small>${esc(a.description)}</small>` : ''}
      <span class="cod-upsell-price">
        ${a.compareAtCents ? `<s>${money(a.compareAtCents)}</s>` : ''}
        ${money(a.priceCents)}
      </span>
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
