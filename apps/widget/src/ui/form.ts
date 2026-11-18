import type { WidgetConfig, Field } from '@cod/contracts';
import { buttonIconSvg } from '@cod/contracts/dist/icons';

/** Icono y color/alineación/tamaño del texto (títulos, párrafos y títulos de campos). */
function lookOf(f: Field): { icon: string; style: string; cls: string } {
  const l = f.look ?? { icon: '', color: '', align: 'left', size: 'md' };
  const color = /^#[0-9a-f]{3,8}$/i.test(l.color) ? l.color : '';
  return {
    icon: l.icon ? `<span class="cod-tico">${buttonIconSvg(l.icon, 'cod-tico-svg')}</span>` : '',
    style: [color ? `color:${color}` : '', l.align && l.align !== 'left' ? `text-align:${l.align};justify-content:${l.align === 'center' ? 'center' : 'flex-end'}` : ''].filter(Boolean).join(';'),
    cls: l.size && l.size !== 'md' ? ` cod-t-${l.size}` : '',
  };
}
import type { FormState } from '../index';
import { validateField } from '../core/validate';
import { mountLocation } from './location';
import { renderOffers } from './offers';
import { money } from '@cod/pricing';

/**
 * Renderiza los campos que vengan del panel. NO hay campos hardcodeados:
 * el orden, las etiquetas, el ancho y las validaciones salen de FormVersion.schema.
 * Añadir un campo nuevo en el admin = aparece aquí, sin tocar código.
 */
export function renderForm(
  root: HTMLElement,
  config: WidgetConfig,
  state: FormState,
  handlers: { onSubmit: () => void },
): void {
  root.innerHTML = `
    <form class="cod-form" novalidate>
      ${config.tokens.progressBar ? '<div class="cod-progress"><span></span></div>' : ''}
      <div class="cod-offers-slot"></div>
      <div class="cod-fields"></div>
      <div class="cod-addons-slot"></div>
      <div class="cod-form-error" role="alert"></div>
      <button type="submit" class="cod-submit cod-submit-anim-${config.tokens.submit.animation}${config.tokens.submit.depth ? ' cod-depth' : ''}">
        <span class="cod-submit-label">${esc(config.tokens.submit.text)}</span>
        <span class="cod-submit-price" hidden></span>
        ${config.tokens.submit.iconType === 'svg' && config.tokens.submit.iconName
          ? `<span class="cod-submit-icon cod-ico">${buttonIconSvg(config.tokens.submit.iconName, 'cod-ico-svg')}</span>`
          : config.tokens.submit.iconType === 'emoji'
            ? `<span class="cod-submit-icon">${esc(config.tokens.submit.icon)}</span>`
            : ''}
        <span class="cod-spinner" aria-hidden="true"></span>
      </button>
    </form>`;

  const form = root.querySelector<HTMLFormElement>('.cod-form')!;
  const box = root.querySelector<HTMLElement>('.cod-fields')!;

  renderOffers(root.querySelector<HTMLElement>('.cod-offers-slot')!, config, state, () => update(root, state));

  const fields = [...config.fields].sort((a, b) => a.order - b.order);
  for (const f of fields) box.appendChild(renderField(f, config, state, () => update(root, state)));

  // Order bumps / upsells / downsells, entre los campos y el botón.
  if (config.addons.length) {
    void import('./addons').then(({ renderAddons }) => {
      renderAddons(root.querySelector<HTMLElement>('.cod-addons-slot')!, config, state, () => update(root, state));
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errors = state.validate();

    if (Object.keys(errors).length) {
      for (const [key, msg] of Object.entries(errors)) showError(root, key, msg);
      root.querySelector('.cod-invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    handlers.onSubmit();
  });

  state.onQuote(() => paintPrice(root, state));
  // La cantidad cambió en la página: marca la tarjeta que toca y recotiza.
  state.onQtyChange((q) => {
    root.querySelectorAll<HTMLElement>('.cod-offer').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.qty) === q)));
    update(root, state);
  });
  update(root, state);
}

/** «Finalizar pedido · RD$ 2,140» con el precio que dio el servidor. */
function paintPrice(root: HTMLElement, state: FormState): void {
  const el = root.querySelector<HTMLElement>('.cod-submit-price');
  const mode = state.config.tokens.submit.priceDisplay;
  const q = state.quote;
  if (!el) return;
  if (!q || !mode || mode === 'none') { el.hidden = true; return; }
  const cents = mode === 'total' ? q.totalCents : q.subtotalCents - q.discountCents + q.addonsCents;
  el.textContent = `· ${money(cents, q.currency)}`;
  el.hidden = false;
}

/** Bloque «Código de descuento»: campo + «Aplicar», validado por el servidor. */
function renderDiscount(f: Field, config: WidgetConfig, state: FormState, onChange: () => void, wrap: HTMLElement): HTMLElement {
  const id = `cod-${f.key}`;
  const req = f.required ? '<span class="cod-req">*</span>' : '<span class="cod-opt">Opcional</span>';
  wrap.innerHTML = `
    ${f.label ? `<label for="${id}">${esc(f.label)} ${req}</label>` : ''}
    <div class="cod-discount">
      <input type="text" id="${id}" autocomplete="off" autocapitalize="characters" spellcheck="false"
        placeholder="${esc(f.placeholder || 'Escribe tu código')}">
      <button type="button" class="cod-discount-btn${config.tokens.applyDepth ? ' cod-depth' : ''}">${esc(f.content || 'Aplicar')}</button>
    </div>
    <span class="cod-discount-ok" hidden></span>
    ${f.help ? `<span class="cod-help">${esc(f.help)}</span>` : ''}
    <span class="cod-err"></span>`;

  const input = wrap.querySelector<HTMLInputElement>('input')!;
  const btn = wrap.querySelector<HTMLButtonElement>('.cod-discount-btn')!;
  const okEl = wrap.querySelector<HTMLElement>('.cod-discount-ok')!;
  const label = f.content || 'Aplicar';
  let applied = false;

  const reset = () => {
    applied = false;
    input.disabled = false;
    btn.textContent = label;
    okEl.hidden = true;
    delete state.values[f.key];
  };

  const apply = async () => {
    clearError(wrap);
    if (applied) {
      reset();
      await state.applyDiscount(null).catch(() => undefined);
      onChange();
      return;
    }
    const code = input.value.trim();
    if (!code) { setError(wrap, 'Escribe un código.'); return; }
    btn.disabled = true;
    btn.classList.add('cod-loading');
    try {
      const q = await state.applyDiscount(code);
      if (!q.appliedDiscount) {
        setError(wrap, 'Este código no es válido o ya caducó.');
      } else {
        applied = true;
        input.disabled = true;
        btn.textContent = 'Quitar';
        state.values[f.key] = q.appliedDiscount.code;
        okEl.textContent = q.discountCents > 0
          ? `Código ${q.appliedDiscount.code} aplicado: ahorras ${money(q.discountCents, q.currency)}`
          : `Código ${q.appliedDiscount.code} aplicado`;
        okEl.hidden = false;
      }
    } catch {
      setError(wrap, 'No pudimos comprobar el código. Inténtalo de nuevo.');
    } finally {
      btn.disabled = false;
      btn.classList.remove('cod-loading');
      onChange();
    }
  };

  btn.addEventListener('click', () => void apply());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void apply(); } });
  input.addEventListener('input', () => clearError(wrap));
  return wrap;
}

function renderField(
  f: Field,
  config: WidgetConfig,
  state: FormState,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `cod-field cod-w${f.width}`;
  wrap.dataset.key = f.key;

  /* Bloques de contenido: no son inputs. */
  const lk = lookOf(f);
  if (f.type === 'heading') { wrap.innerHTML = `<h3 class="cod-heading${lk.cls}" style="${lk.style}">${lk.icon}<span>${esc(f.content)}</span></h3>`; return wrap; }
  if (f.type === 'subheading') { wrap.innerHTML = `<p class="cod-subheading${lk.cls}" style="${lk.style}">${lk.icon}<span>${esc(f.content)}</span></p>`; return wrap; }
  if (f.type === 'divider') { wrap.innerHTML = '<hr class="cod-divider">'; return wrap; }
  if (f.type === 'html') { wrap.innerHTML = `<div class="cod-html">${f.content}</div>`; return wrap; }
  if (f.type === 'image') { wrap.innerHTML = f.content ? `<img class="cod-img" src="${esc(f.content)}" alt="" loading="lazy">` : ''; return wrap; }
  if (f.type === 'richtext') { wrap.innerHTML = `<p class="cod-richtext${lk.cls}" style="${lk.style}">${lk.icon}<span>${esc(f.content).replace(/\n/g, '<br>')}</span></p>`; return wrap; }
  if (f.type === 'video') { wrap.innerHTML = videoEmbed(f.content); return wrap; }
  // Tipos sin soporte en el envío (subir archivo, mapa antiguo): no se muestran.
  if (f.type === 'file' || f.type === 'map') { wrap.className += ' cod-hidden'; return wrap; }

  if (f.type === 'discount') return renderDiscount(f, config, state, onChange, wrap);

  /* El bloque de ubicación es especial: trae su propio módulo (y su mapa lazy). */
  if (f.type === 'location') {
    mountLocation(wrap, config, state, onChange);
    return wrap;
  }

  const id = `cod-${f.key}`;
  const req = f.required ? '<span class="cod-req">*</span>' : '<span class="cod-opt">Opcional</span>';
  const label = f.label ? `<label for="${id}" class="cod-flabel" style="${lk.style}">${lk.icon}<span>${esc(f.label)}</span> ${req}</label>` : '';
  const help = f.help ? `<span class="cod-help">${esc(f.help)}</span>` : '';

  let control: string;
  switch (f.type) {
    case 'textarea':
      control = `<textarea id="${id}" rows="2" placeholder="${esc(f.placeholder)}"></textarea>`;
      break;
    case 'select':
      control = `<div class="cod-select"><select id="${id}">
        <option value="" disabled selected>${esc(f.placeholder || 'Selecciona…')}</option>
        ${f.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
      </select></div>`;
      break;
    case 'checkbox':
      control = `<label class="cod-check">
        <input type="checkbox" id="${id}"><span class="cod-check-box"></span>
        <span>${esc(f.content || f.label)}</span></label>`;
      break;
    case 'radio':
      control = `<div class="cod-choices" role="radiogroup">${f.options.map((o, i) => `
        <label class="cod-choice"><input type="radio" name="${id}" value="${esc(o.value)}" ${i === 0 ? `id="${id}"` : ''}>
        <span class="cod-choice-dot"></span><span>${esc(o.label)}</span></label>`).join('')}</div>`;
      break;
    case 'multiselect':
      control = `<div class="cod-choices">${f.options.map((o, i) => `
        <label class="cod-choice"><input type="checkbox" value="${esc(o.value)}" ${i === 0 ? `id="${id}"` : ''}>
        <span class="cod-check-box"></span><span>${esc(o.label)}</span></label>`).join('')}</div>`;
      break;
    case 'phone':
      control = `<div class="cod-phone"><span>+1</span>
        <input type="tel" id="${id}" inputmode="tel" placeholder="${esc(f.placeholder)}"></div>`;
      break;
    default: {
      const type = f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text';
      control = `<input type="${type}" id="${id}"
        placeholder="${esc(f.placeholder)}" ${f.type === 'number' ? 'inputmode="numeric"' : ''}>`;
    }
  }

  wrap.innerHTML = `${f.type === 'checkbox' ? '' : label}${control}${help}<span class="cod-err"></span>`;

  if (f.type === 'radio' || f.type === 'multiselect') {
    const boxes = [...wrap.querySelectorAll<HTMLInputElement>('.cod-choices input')];
    boxes.forEach((b) => b.addEventListener('change', () => {
      state.values[f.key] = boxes.filter((x) => x.checked).map((x) => x.value).join(', ');
      clearError(wrap);
      onChange();
    }));
    return wrap;
  }

  const input = wrap.querySelector<HTMLInputElement>('input, select, textarea')!;
  const event = f.type === 'select' || f.type === 'checkbox' ? 'change' : 'input';

  input.addEventListener(event, () => {
    if (f.type === 'checkbox') {
      state.values[f.key] = input.checked ? 'true' : '';
    } else if (f.type === 'phone') {
      // Máscara dominicana: 809 555 1234
      const d = input.value.replace(/\D/g, '').slice(0, 10);
      input.value = d.length > 6 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
                  : d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
      state.values[f.key] = input.value;
    } else {
      state.values[f.key] = input.value;
    }
    clearError(wrap);
    onChange();
  });

  input.addEventListener('blur', () => {
    const err = validateField(f, state.values[f.key] ?? '');
    if (err) setError(wrap, err);
  });

  return wrap;
}

/** Repinta visibilidad condicional + barra de progreso. Throttled con rAF (uno por formulario). */
const pending = new WeakMap<HTMLElement, number>();
function update(root: HTMLElement, state: FormState): void {
  if (pending.get(root)) return;
  pending.set(root, requestAnimationFrame(() => {
    pending.delete(root);
    const visible = new Set(state.visibleFields().map((f) => f.key));

    root.querySelectorAll<HTMLElement>('.cod-field').forEach((el) => {
      const key = el.dataset.key!;
      const show = visible.has(key) || !state.config.fields.some((f) => f.key === key);
      el.classList.toggle('cod-hidden', !show);
    });

    if (state.config.tokens.submit.priceDisplay !== 'none') state.requestQuote();
    paintPrice(root, state);

    const bar = root.querySelector<HTMLElement>('.cod-progress span');
    if (bar) {
      const required = state.visibleFields().filter((f) => f.required);
      const done = required.filter((f) => !validateField(f, state.values[f.key] ?? '')).length;
      const pct = required.length ? (done / required.length) * 100 : 0;
      bar.style.width = `${pct}%`;
      root.querySelector('.cod-submit')?.classList.toggle('cod-ready', pct === 100);
    }
  }));
}

function showError(root: HTMLElement, key: string, msg: string) {
  const el = root.querySelector<HTMLElement>(`.cod-field[data-key="${key}"]`);
  if (el) setError(el, msg);
}
function setError(wrap: HTMLElement, msg: string) {
  wrap.classList.add('cod-invalid');
  const e = wrap.querySelector('.cod-err');
  if (e) e.textContent = msg;
}
function clearError(wrap: HTMLElement) {
  wrap.classList.remove('cod-invalid');
  const e = wrap.querySelector('.cod-err');
  if (e) e.textContent = '';
}

/** YouTube / Vimeo como iframe; cualquier otra URL como <video>. */
function videoEmbed(url: string): string {
  const u = (url || '').trim();
  if (!u) return '';
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(u);
  if (yt) return `<div class="cod-video"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  const vm = /vimeo\.com\/(\d+)/.exec(u);
  if (vm) return `<div class="cod-video"><iframe src="https://player.vimeo.com/video/${vm[1]}" allowfullscreen loading="lazy"></iframe></div>`;
  return `<div class="cod-video"><video src="${esc(u)}" controls playsinline preload="metadata"></video></div>`;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
