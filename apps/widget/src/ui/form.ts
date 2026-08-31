import type { WidgetConfig, Field } from '@cod/contracts';
import type { FormState } from '../index';
import { validateField } from '../core/validate';
import { mountLocation } from './location';

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
      <div class="cod-fields"></div>
      <div class="cod-addons-slot"></div>
      <div class="cod-form-error" role="alert"></div>
      <button type="submit" class="cod-submit cod-submit-anim-${config.tokens.submit.animation}">
        <span class="cod-submit-label">${esc(config.tokens.submit.text)}</span>
        ${config.tokens.submit.iconType === 'emoji'
          ? `<span class="cod-submit-icon">${esc(config.tokens.submit.icon)}</span>`
          : ''}
        <span class="cod-spinner" aria-hidden="true"></span>
      </button>
    </form>`;

  const form = root.querySelector<HTMLFormElement>('.cod-form')!;
  const box = root.querySelector<HTMLElement>('.cod-fields')!;

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

  update(root, state);
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
  if (f.type === 'heading') { wrap.innerHTML = `<h3 class="cod-heading">${esc(f.content)}</h3>`; return wrap; }
  if (f.type === 'subheading') { wrap.innerHTML = `<p class="cod-subheading">${esc(f.content)}</p>`; return wrap; }
  if (f.type === 'divider') { wrap.innerHTML = '<hr class="cod-divider">'; return wrap; }
  if (f.type === 'html') { wrap.innerHTML = `<div class="cod-html">${f.content}</div>`; return wrap; }
  if (f.type === 'image') { wrap.innerHTML = `<img class="cod-img" src="${esc(f.content)}" alt="" loading="lazy">`; return wrap; }

  /* El bloque de ubicación es especial: trae su propio módulo (y su mapa lazy). */
  if (f.type === 'location') {
    mountLocation(wrap, config, state, onChange);
    return wrap;
  }

  const id = `cod-${f.key}`;
  const req = f.required ? '<span class="cod-req">*</span>' : '<span class="cod-opt">Opcional</span>';
  const label = f.label ? `<label for="${id}">${esc(f.label)} ${req}</label>` : '';
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
    case 'phone':
      control = `<div class="cod-phone"><span>+1</span>
        <input type="tel" id="${id}" inputmode="tel" placeholder="${esc(f.placeholder)}"></div>`;
      break;
    default:
      control = `<input type="${f.type === 'email' ? 'email' : 'text'}" id="${id}"
        placeholder="${esc(f.placeholder)}" ${f.type === 'number' ? 'inputmode="numeric"' : ''}>`;
  }

  wrap.innerHTML = `${f.type === 'checkbox' ? '' : label}${control}${help}<span class="cod-err"></span>`;

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

/** Repinta visibilidad condicional + barra de progreso. Throttled con rAF. */
let raf = 0;
function update(root: HTMLElement, state: FormState): void {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const visible = new Set(state.visibleFields().map((f) => f.key));

    root.querySelectorAll<HTMLElement>('.cod-field').forEach((el) => {
      const key = el.dataset.key!;
      const show = visible.has(key) || !state.config.fields.some((f) => f.key === key);
      el.classList.toggle('cod-hidden', !show);
    });

    const bar = root.querySelector<HTMLElement>('.cod-progress span');
    if (bar) {
      const required = state.visibleFields().filter((f) => f.required);
      const done = required.filter((f) => !validateField(f, state.values[f.key] ?? '')).length;
      const pct = required.length ? (done / required.length) * 100 : 0;
      bar.style.width = `${pct}%`;
      root.querySelector('.cod-submit')?.classList.toggle('cod-ready', pct === 100);
    }
  });
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

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
