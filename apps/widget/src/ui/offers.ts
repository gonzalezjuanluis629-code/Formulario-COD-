import type { Offer, WidgetConfig } from '@cod/contracts';
import { provinceAllows } from '../core/province';
import { money } from '@cod/pricing';
import type { FormState } from '../index';
import { ANIMATION_SPEEDS } from './animations';
import { marchSvg } from './cardAnimations';

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
    style: { border: 'solid', borderColor: '', bg: '', animation: 'none', animationSpeed: 'normal', badgeColor: '', badgeSide: 'right', badgeTimer: 0 },
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
    const st = o.style;
    const anim = st?.animation && st.animation !== 'none' ? ` cod-card cod-card-anim-${st.animation}` : '';
    const ribbon = !!(o.badge || st?.badgeTimer);
    return `
    <button type="button" class="cod-offer${ribbon ? ' cod-offer-has-badge' : ''}${anim}" role="radio"
      aria-checked="${o.minQty === state.qty}" data-qty="${o.minQty}" data-offer="${esc(o.id)}" style="${cardVars(o)}">
      ${st?.animation === 'march' ? marchSvg('cod-card') : ''}
      ${ribbon ? `<span class="cod-offer-ribbon${st?.badgeSide === 'left' ? ' cod-offer-ribbon-left' : ''}"${st?.badgeColor ? ` style="background:${cssColor(st.badgeColor)}"` : ''}>${o.badge ? `<span>${esc(o.badge)}</span>` : ''}${st?.badgeTimer ? `<span class="cod-offer-clock">${o.badge ? '' : 'Termina en '}<b data-timer="${st.badgeTimer}" data-key="${esc(o.id)}"></b></span>` : ''}</span>` : ''}
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
  // Las rayas que caminan siguen la esquina redondeada de la tarjeta.
  wrap.querySelectorAll<HTMLElement>('.cod-card-anim-march').forEach((el) => requestAnimationFrame(() => {
    const r = Math.max(0, (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12) - 1);
    el.querySelector('.cod-card-march rect')?.setAttribute('rx', String(r));
    el.querySelector('.cod-card-march rect')?.setAttribute('ry', String(r));
  }));
  wrap.querySelectorAll<HTMLElement>('[data-timer]').forEach((b) => countdown(b, Number(b.dataset.timer) || 0, `cod-offer-${b.dataset.key}`));
}

/** Solo colores simples (#hex, rgb(), nombres): nada que rompa el atributo style. */
function cssColor(v: string): string {
  const c = v.trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(c) ? c : '';
}

/** Borde, fondo y animación que eligió la tienda para esta tarjeta (vacío = los del diseño). */
function cardVars(o: Offer): string {
  const st = o.style;
  if (!st) return '';
  const out: string[] = [];
  const border = cssColor(st.borderColor);
  const bg = cssColor(st.bg);
  if (st.border === 'none') out.push('--offer-border:transparent');
  else {
    if (border) out.push(`--offer-border:${border}`);
    if (st.border === 'dashed') out.push('--offer-border-style:dashed');
  }
  if (bg) out.push(`--offer-bg:${bg}`);
  out.push(`--card-color:${border || 'var(--cod-offer-accent)'}`);
  out.push(`--anim-speed:${ANIMATION_SPEEDS[st.animationSpeed ?? 'normal']}`);
  return out.join(';');
}

/** Cuenta regresiva de la cinta: por visitante (se recuerda en el navegador) y vuelve a empezar en cero. */
function countdown(out: HTMLElement, mins: number, key: string): void {
  if (!mins) return;
  const total = mins * 60;
  let start = Date.now();
  try { const v = Number(localStorage.getItem(key)); if (v > 0 && v <= Date.now()) start = v; else localStorage.setItem(key, String(start)); } catch { /* sin almacenamiento: dura esta visita */ }
  const p = (n: number) => String(n).padStart(2, '0');
  const tick = () => {
    let left = total - Math.floor((Date.now() - start) / 1000);
    if (left <= 0) { start = Date.now(); try { localStorage.setItem(key, String(start)); } catch { /* nada */ } left = total; }
    const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
    out.textContent = h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };
  tick();
  const t = window.setInterval(() => { if (!out.isConnected) { window.clearInterval(t); return; } tick(); }, 1000);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
