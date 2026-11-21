import type { Addon, WidgetConfig } from '@cod/contracts';
import type { FormState } from '../index';
import { money } from '@cod/pricing';
import { provinceAllows } from '@cod/contracts';
import { ANIMATION_SPEEDS } from './animations';
import { marchSvg } from './cardAnimations';

/**
 * Order bumps, upsells y downsells dentro del formulario.
 *
 * - ORDER_BUMP: casilla de un clic. La forma más efectiva de subir el ticket:
 *   el cliente añade el extra sin salir del flujo.
 * - UPSELL: tarjeta con imagen y precio; botón "Añadir".
 * - DOWNSELL: oculto de inicio. Solo aparece si el cliente RECHAZA su upsell
 *   asociado (replacesId), ofreciéndole una alternativa más barata.
 *
 * Se muestran en el orden que el comerciante eligió en el panel (prioridad).
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
  const addons = config.addons.filter((a) => a.minCartCents <= config.product.unitPriceCents * state.qty
    && provinceAllows(a.provinces, state.province()));
  if (!addons.length) return;

  const downsells = addons.filter((a) => a.kind === 'DOWNSELL');

  const wrap = document.createElement('div');
  wrap.className = 'cod-addons';

  // Mismo orden que eligió el comerciante en la lista de extras.
  for (const a of addons) {
    if (a.kind === 'ORDER_BUMP') wrap.appendChild(renderBump(a, state, onChange));
    else if (a.kind === 'UPSELL') {
      wrap.appendChild(renderUpsell(a, downsells.find((d) => d.replacesId === a.id) ?? null, state, onChange));
    }
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
  return `${border};background:${st.bg};--card-color:${st.borderColor};--anim-speed:${ANIMATION_SPEEDS[st.animationSpeed ?? 'normal']}`;
}

/** «09:59» o «1:05:30». */
function clock(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/**
 * Etiqueta que sobresale arriba de la tarjeta («🔥 Oferta flash»), con cuenta
 * regresiva opcional. El reloj es por visitante (se recuerda en el navegador)
 * y vuelve a empezar al llegar a cero.
 */
function addTag(el: HTMLElement, a: Addon): void {
  const text = (a.style.badgeText ?? '').trim();
  const mins = a.style.badgeTimer ?? 0;
  if (!text && !mins) return;
  el.classList.add('cod-has-tag');
  const tag = document.createElement('span');
  tag.className = `cod-tag cod-tag-${a.style.badgeSide === 'left' ? 'left' : 'right'}`;
  tag.style.setProperty('--tag-bg', a.style.badgeColor || '#e11d48');
  tag.innerHTML = `${text ? `<span class="cod-tag-text">${esc(text)}</span>` : ''}${mins ? `<span class="cod-tag-clock" aria-live="off">${text ? '' : 'Termina en '}<b></b></span>` : ''}`;
  el.appendChild(tag);
  if (!mins) return;
  const total = mins * 60;
  const key = `cod-tag-${a.id}`;
  let start = Date.now();
  try { const v = Number(localStorage.getItem(key)); if (v > 0 && v <= Date.now()) start = v; else localStorage.setItem(key, String(start)); } catch { /* sin almacenamiento: dura esta visita */ }
  const out = tag.querySelector('b')!;
  const tick = () => {
    let left = total - Math.floor((Date.now() - start) / 1000);
    if (left <= 0) { start = Date.now(); try { localStorage.setItem(key, String(start)); } catch { /* nada */ } left = total; }
    out.textContent = clock(left);
  };
  tick();
  const timer = window.setInterval(() => { if (!el.isConnected) { window.clearInterval(timer); return; } tick(); }, 1000);
}

/** Clase y dibujo de la animación elegida para la tarjeta (si hay). */
function animate(el: HTMLElement, a: Addon): void {
  const anim = a.style.animation ?? 'none';
  if (anim === 'none') return;
  el.classList.add('cod-card', `cod-card-anim-${anim}`);
  if (anim !== 'march') return;
  el.insertAdjacentHTML('afterbegin', marchSvg('cod-card'));
  // Las rayas siguen la misma esquina redondeada que la tarjeta.
  requestAnimationFrame(() => {
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
    el.querySelector('.cod-card-march rect')?.setAttribute('rx', String(Math.max(0, r - 1)));
    el.querySelector('.cod-card-march rect')?.setAttribute('ry', String(Math.max(0, r - 1)));
  });
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
  el.dataset.addonId = a.id;
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
  animate(el, a);
  addTag(el, a);
  // Al volver a pintarse (cambió la provincia), sigue marcado si ya lo estaba.
  if (state.acceptedAddons.some((x) => x.id === a.id)) {
    el.querySelector('input')!.checked = true;
    el.classList.add('cod-bump-on');
  }

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
  el.dataset.addonId = a.id;
  el.setAttribute('style', cardStyle(a));
  el.innerHTML = `
    ${a.image ? `<img class="cod-upsell-img" src="${esc(a.image)}" alt="" loading="lazy">` : ''}
    <div class="cod-upsell-body">
      <span class="cod-bump-title">${richTitle(a)}</span>
      ${a.description ? `<small>${esc(a.description)}</small>` : ''}
      ${priceTag(a, 'cod-upsell-price')}
    </div>
    <button type="button" class="cod-upsell-add">Añadir</button>`;
  animate(el, a);
  addTag(el, a);

  const btn = el.querySelector<HTMLButtonElement>('.cod-upsell-add')!;
  let added = state.acceptedAddons.some((x) => x.id === a.id);
  if (added) { el.classList.add('cod-upsell-on'); btn.textContent = 'Quitar'; }
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
