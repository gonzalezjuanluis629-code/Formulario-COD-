const BASE = "/apps/cod";
async function call(path, init) {
  var _a, _b;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(_a = init == null ? void 0 : init.headers) != null ? _a : {} }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Error de red" }));
    throw new ApiError(res.status, (_b = body.message) != null ? _b : "Error");
  }
  return res.json();
}
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const api = {
  config: (productId, variantId) => call(`/form?productId=${encodeURIComponent(productId)}&variantId=${encodeURIComponent(variantId)}`),
  quote: (body) => call("/quote", { method: "POST", body: JSON.stringify(body) }),
  /** La API key de Google no toca jamás el navegador. */
  reverse: (lat, lng) => call("/geo/reverse", { method: "POST", body: JSON.stringify({ lat, lng }) }),
  submit: (body) => call("/submit", { method: "POST", body: JSON.stringify(body) }),
  /** Evento de embudo. sendBeacon no bloquea al cliente ni espera respuesta. */
  track: (formId, event, sessionId, field) => {
    const body = JSON.stringify({ formId, event, sessionId, field: field != null ? field : null, ts: Date.now() });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${BASE}/track${location.search}`, new Blob([body], { type: "application/json" }));
        return;
      }
    } catch {
    }
    void fetch(`${BASE}/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  }
};
function tokensToCss(t) {
  const shadow = { none: "none", sm: "0 1px 3px rgba(0,0,0,.08)", md: "0 4px 20px rgba(0,0,0,.12)", lg: "0 10px 40px rgba(0,0,0,.18)" }[t.shadow];
  const gap = { compact: "11px", normal: "15px", relaxed: "20px" }[t.spacing];
  return `
    --cod-brand:${t.brand};
    --cod-ok:${t.success};
    --cod-danger:${t.danger};
    --cod-surface:${t.surface};
    --cod-field:${t.field};
    --cod-border:${t.border};
    --cod-text:${t.text};
    --cod-muted:${t.muted};
    --cod-font:${t.fontFamily};
    --cod-size:${t.fontSize}px;
    --cod-radius:${t.radius}px;
    --cod-btn-radius:${t.submit.radius}px;
    --cod-btn-height:${t.submit.height}px;
    --cod-btn-size:${t.submit.fontSize}px;
    --cod-btn-bg:${t.submit.bg};
    --cod-btn-color:${t.submit.color};
    --cod-btn-ready:${t.submit.readyBg || t.readyColor};
    --cod-shadow:${shadow};
    --cod-gap:${gap};
    --cod-progress:${t.progressColor};
    --cod-ease:${t.animations ? "cubic-bezier(.32,.72,0,1)" : "linear"};
    --cod-dur:${t.animations ? ".3s" : "0s"};
  `;
}
function validateField(f, value) {
  const v = (value != null ? value : "").trim();
  if (f.required && !v) return `${f.label || "Este campo"} es obligatorio.`;
  if (!v) return null;
  const { minLength, maxLength, regex, message } = f.validation;
  if (minLength != null && v.length < minLength) return message != null ? message : `Mínimo ${minLength} caracteres.`;
  if (maxLength != null && v.length > maxLength) return message != null ? message : `Máximo ${maxLength} caracteres.`;
  if (regex && !new RegExp(regex).test(v)) return message != null ? message : "Formato no válido.";
  if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Revisa el correo.";
  if (f.type === "phone" && !/^(809|829|849)\d{7}$/.test(v.replace(/\D/g, ""))) {
    return "Número no válido (809, 829 u 849).";
  }
  return null;
}
function isVisible(f, values) {
  if (!f.visible) return false;
  return f.conditions.every((c) => {
    var _a;
    const v = (_a = values[c.field]) != null ? _a : "";
    switch (c.op) {
      case "eq":
        return v === String(c.value);
      case "neq":
        return v !== String(c.value);
      case "contains":
        return v.includes(String(c.value));
      case "empty":
        return v === "";
      case "notEmpty":
        return v !== "";
      case "gt":
        return Number(v) > Number(c.value);
      case "gte":
        return Number(v) >= Number(c.value);
      case "lt":
        return Number(v) < Number(c.value);
      case "lte":
        return Number(v) <= Number(c.value);
      default:
        return true;
    }
  });
}
function mountLocation(wrap, config, state, onChange) {
  const c = config.location;
  wrap.innerHTML = `
    <label>Dirección de entrega <span class="cod-req">*</span></label>
    <div class="cod-seg" role="radiogroup">
      <span class="cod-glider"></span>
      ${c.gpsEnabled ? `
      <button type="button" class="cod-seg-btn" data-mode="gps" role="radio" aria-checked="false">
        <span class="cod-seg-ico"><span class="cod-spinner-sm"></span></span>
        <b>${esc$1(c.gpsLabel)}</b><small>${esc$1(c.gpsHint)}</small>
      </button>` : ""}
      ${c.manualEnabled ? `
      <button type="button" class="cod-seg-btn" data-mode="manual" role="radio" aria-checked="false">
        <span class="cod-seg-ico"></span>
        <b>${esc$1(c.manualLabel)}</b><small>${esc$1(c.manualHint)}</small>
      </button>` : ""}
    </div>

    <div class="cod-map-panel" hidden>
      <div class="cod-map cod-map-locked"><div class="cod-map-tiles"></div>
        <div class="cod-map-acc"></div><div class="cod-map-pin"></div>
        <span class="cod-map-lock">Ubicación fijada</span>
      </div>
      <div class="cod-locbar"><b class="cod-loc-addr">Ubicación marcada</b><span class="cod-loc-coords"></span></div>
      <button type="button" class="cod-edit-btn">Editar ubicación</button>
    </div>

    <div class="cod-manual-panel" hidden></div>
    <span class="cod-err"></span>`;
  const segs = wrap.querySelectorAll(".cod-seg-btn");
  const mapPanel = wrap.querySelector(".cod-map-panel");
  const manualPanel = wrap.querySelector(".cod-manual-panel");
  const errEl = wrap.querySelector(".cod-err");
  let map = null;
  segs.forEach((btn) => {
    btn.addEventListener("click", () => void setMode(btn.dataset.mode));
  });
  async function setMode(mode) {
    wrap.querySelector(".cod-seg").setAttribute("data-active", mode);
    segs.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
    errEl.textContent = "";
    if (mode === "manual") {
      mapPanel.hidden = true;
      manualPanel.hidden = false;
      state.location = null;
      onChange();
      return;
    }
    manualPanel.hidden = true;
    await locate();
  }
  async function locate() {
    const gpsBtn = wrap.querySelector('[data-mode="gps"]');
    gpsBtn.classList.add("cod-locating");
    try {
      const pos = await getPosition();
      const { createMap } = await import("./map-BTnRQ8LE.js");
      mapPanel.hidden = false;
      map = createMap(wrap.querySelector(".cod-map"), {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        zoom: config.location.defaultZoom,
        onMove: (lat, lng) => {
          state.location = {
            lat,
            lng,
            accuracyMeters: null,
            source: "MAP_PIN",
            capturedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          void reverse(lat, lng);
          onChange();
        }
      });
      state.location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Math.round(pos.coords.accuracy),
        source: "GPS",
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      map.setAccuracy(pos.coords.accuracy);
      void reverse(pos.coords.latitude, pos.coords.longitude);
      onChange();
    } catch {
      await setMode("manual");
      errEl.textContent = "Sin acceso a tu ubicación. Escribe tu dirección aquí abajo.";
      errEl.classList.add("cod-soft");
    } finally {
      gpsBtn.classList.remove("cod-locating");
    }
  }
  async function reverse(lat, lng) {
    var _a;
    const addrEl = wrap.querySelector(".cod-loc-addr");
    const coordsEl = wrap.querySelector(".cod-loc-coords");
    coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    addrEl.textContent = "Buscando dirección…";
    try {
      const r = await api.reverse(lat, lng);
      addrEl.textContent = (_a = r.formatted) != null ? _a : "Ubicación marcada";
      if (r.provinceCode) state.values.provinceCode = r.provinceCode;
      if (r.city) state.values.city = r.city;
      if (r.district) state.values.sector = r.district;
      if (r.street) state.values.street = [r.street, r.number].filter(Boolean).join(" ");
    } catch {
      addrEl.textContent = "Ubicación marcada";
    }
  }
  wrap.querySelector(".cod-edit-btn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const on = !(map == null ? void 0 : map.isEditing());
    map == null ? void 0 : map.setEditing(on);
    btn.textContent = on ? "Guardar ubicación" : "Editar ubicación";
    btn.classList.toggle("cod-saving", on);
  });
}
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("sin soporte"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12e3,
      maximumAge: 0
    });
  });
}
const esc$1 = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function renderForm(root, config, state, handlers) {
  root.innerHTML = `
    <form class="cod-form" novalidate>
      ${config.tokens.progressBar ? '<div class="cod-progress"><span></span></div>' : ""}
      <div class="cod-fields"></div>
      <div class="cod-addons-slot"></div>
      <div class="cod-form-error" role="alert"></div>
      <button type="submit" class="cod-submit cod-submit-anim-${config.tokens.submit.animation}">
        <span class="cod-submit-label">${esc(config.tokens.submit.text)}</span>
        ${config.tokens.submit.iconType === "emoji" ? `<span class="cod-submit-icon">${esc(config.tokens.submit.icon)}</span>` : ""}
        <span class="cod-spinner" aria-hidden="true"></span>
      </button>
    </form>`;
  const form = root.querySelector(".cod-form");
  const box = root.querySelector(".cod-fields");
  const fields = [...config.fields].sort((a, b) => a.order - b.order);
  for (const f of fields) box.appendChild(renderField(f, config, state, () => update(root, state)));
  if (config.addons.length) {
    void import("./addons-BTJTFXLV.js").then(({ renderAddons }) => {
      renderAddons(root.querySelector(".cod-addons-slot"), config, state, () => update(root, state));
    });
  }
  form.addEventListener("submit", (e) => {
    var _a;
    e.preventDefault();
    const errors = state.validate();
    if (Object.keys(errors).length) {
      for (const [key, msg] of Object.entries(errors)) showError(root, key, msg);
      (_a = root.querySelector(".cod-invalid")) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    handlers.onSubmit();
  });
  update(root, state);
}
function renderField(f, config, state, onChange) {
  const wrap = document.createElement("div");
  wrap.className = `cod-field cod-w${f.width}`;
  wrap.dataset.key = f.key;
  if (f.type === "heading") {
    wrap.innerHTML = `<h3 class="cod-heading">${esc(f.content)}</h3>`;
    return wrap;
  }
  if (f.type === "subheading") {
    wrap.innerHTML = `<p class="cod-subheading">${esc(f.content)}</p>`;
    return wrap;
  }
  if (f.type === "divider") {
    wrap.innerHTML = '<hr class="cod-divider">';
    return wrap;
  }
  if (f.type === "html") {
    wrap.innerHTML = `<div class="cod-html">${f.content}</div>`;
    return wrap;
  }
  if (f.type === "image") {
    wrap.innerHTML = `<img class="cod-img" src="${esc(f.content)}" alt="" loading="lazy">`;
    return wrap;
  }
  if (f.type === "location") {
    mountLocation(wrap, config, state, onChange);
    return wrap;
  }
  const id = `cod-${f.key}`;
  const req = f.required ? '<span class="cod-req">*</span>' : '<span class="cod-opt">Opcional</span>';
  const label = f.label ? `<label for="${id}">${esc(f.label)} ${req}</label>` : "";
  const help = f.help ? `<span class="cod-help">${esc(f.help)}</span>` : "";
  let control;
  switch (f.type) {
    case "textarea":
      control = `<textarea id="${id}" rows="2" placeholder="${esc(f.placeholder)}"></textarea>`;
      break;
    case "select":
      control = `<div class="cod-select"><select id="${id}">
        <option value="" disabled selected>${esc(f.placeholder || "Selecciona…")}</option>
        ${f.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}
      </select></div>`;
      break;
    case "checkbox":
      control = `<label class="cod-check">
        <input type="checkbox" id="${id}"><span class="cod-check-box"></span>
        <span>${esc(f.content || f.label)}</span></label>`;
      break;
    case "phone":
      control = `<div class="cod-phone"><span>+1</span>
        <input type="tel" id="${id}" inputmode="tel" placeholder="${esc(f.placeholder)}"></div>`;
      break;
    default:
      control = `<input type="${f.type === "email" ? "email" : "text"}" id="${id}"
        placeholder="${esc(f.placeholder)}" ${f.type === "number" ? 'inputmode="numeric"' : ""}>`;
  }
  wrap.innerHTML = `${f.type === "checkbox" ? "" : label}${control}${help}<span class="cod-err"></span>`;
  const input = wrap.querySelector("input, select, textarea");
  const event = f.type === "select" || f.type === "checkbox" ? "change" : "input";
  input.addEventListener(event, () => {
    if (f.type === "checkbox") {
      state.values[f.key] = input.checked ? "true" : "";
    } else if (f.type === "phone") {
      const d = input.value.replace(/\D/g, "").slice(0, 10);
      input.value = d.length > 6 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
      state.values[f.key] = input.value;
    } else {
      state.values[f.key] = input.value;
    }
    clearError(wrap);
    onChange();
  });
  input.addEventListener("blur", () => {
    var _a;
    const err = validateField(f, (_a = state.values[f.key]) != null ? _a : "");
    if (err) setError(wrap, err);
  });
  return wrap;
}
let raf = 0;
function update(root, state) {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    var _a;
    raf = 0;
    const visible = new Set(state.visibleFields().map((f) => f.key));
    root.querySelectorAll(".cod-field").forEach((el) => {
      const key = el.dataset.key;
      const show = visible.has(key) || !state.config.fields.some((f) => f.key === key);
      el.classList.toggle("cod-hidden", !show);
    });
    const bar = root.querySelector(".cod-progress span");
    if (bar) {
      const required = state.visibleFields().filter((f) => f.required);
      const done = required.filter((f) => {
        var _a2;
        return !validateField(f, (_a2 = state.values[f.key]) != null ? _a2 : "");
      }).length;
      const pct = required.length ? done / required.length * 100 : 0;
      bar.style.width = `${pct}%`;
      (_a = root.querySelector(".cod-submit")) == null ? void 0 : _a.classList.toggle("cod-ready", pct === 100);
    }
  });
}
function showError(root, key, msg) {
  const el = root.querySelector(`.cod-field[data-key="${key}"]`);
  if (el) setError(el, msg);
}
function setError(wrap, msg) {
  wrap.classList.add("cod-invalid");
  const e = wrap.querySelector(".cod-err");
  if (e) e.textContent = msg;
}
function clearError(wrap) {
  wrap.classList.remove("cod-invalid");
  const e = wrap.querySelector(".cod-err");
  if (e) e.textContent = "";
}
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CSS = `
*,*::before,*::after{box-sizing:border-box}
.cod-root{font-family:var(--cod-font);font-size:var(--cod-size);color:var(--cod-text);
  background:var(--cod-surface);border-radius:var(--cod-radius);box-shadow:var(--cod-shadow);
  padding:18px;-webkit-tap-highlight-color:transparent}

.cod-skeleton{display:grid;gap:10px}
.cod-skeleton span{height:42px;border-radius:var(--cod-radius);
  background:linear-gradient(100deg,#eee 30%,#f7f7f7 50%,#eee 70%);background-size:220% 100%;
  animation:cod-shim 1.1s linear infinite}
@keyframes cod-shim{from{background-position:120% 0}to{background-position:-120% 0}}

.cod-progress{height:4px;background:#f0f0f0;border-radius:99px;overflow:hidden;margin-bottom:14px}
.cod-progress span{display:block;height:100%;width:0;border-radius:99px;background:var(--cod-progress);
  transition:width .6s var(--cod-ease)}

.cod-fields{display:grid;grid-template-columns:repeat(12,1fr);gap:var(--cod-gap)}
.cod-field{grid-column:span 12;animation:cod-in .35s var(--cod-ease) both}
.cod-w50{grid-column:span 6}.cod-w33{grid-column:span 4}.cod-w25{grid-column:span 3}
.cod-w66{grid-column:span 8}.cod-w75{grid-column:span 9}
.cod-hidden{display:none}
@keyframes cod-in{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}

.cod-field label{display:block;font-size:12px;font-weight:600;color:var(--cod-text);margin-bottom:5px}
.cod-req{color:var(--cod-danger)}
.cod-opt{float:right;font-size:10px;color:var(--cod-muted);text-transform:uppercase}
.cod-field input,.cod-field select,.cod-field textarea{width:100%;padding:10px 12px;
  border:1.5px solid var(--cod-border);border-radius:var(--cod-radius);background:var(--cod-field);
  color:var(--cod-text);font:inherit;outline:none;-webkit-appearance:none;
  transition:border-color .2s var(--cod-ease),box-shadow .2s var(--cod-ease)}
.cod-field input:focus,.cod-field select:focus,.cod-field textarea:focus{
  border-color:var(--cod-brand);background:#fff;box-shadow:0 0 0 3.5px rgba(0,0,0,.06)}
.cod-field textarea{resize:none;line-height:1.5}
.cod-invalid input,.cod-invalid select,.cod-invalid textarea,.cod-invalid .cod-phone{
  border-color:var(--cod-danger);animation:cod-shake .34s var(--cod-ease)}
@keyframes cod-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}
  45%{transform:translateX(3px)}70%{transform:translateX(-2px)}}
.cod-err{display:block;font-size:11.5px;color:var(--cod-danger);margin-top:4px}
.cod-err:empty{display:none}
.cod-err.cod-soft{color:var(--cod-muted)}
.cod-help{display:block;font-size:11px;color:var(--cod-muted);margin-top:4px}

.cod-phone{display:flex;align-items:center;border:1.5px solid var(--cod-border);
  border-radius:var(--cod-radius);background:var(--cod-field);overflow:hidden}
.cod-phone:focus-within{border-color:var(--cod-brand);background:#fff;box-shadow:0 0 0 3.5px rgba(0,0,0,.06)}
.cod-phone span{padding:10px 10px 10px 12px;color:var(--cod-muted);border-right:1.5px solid var(--cod-border)}
.cod-phone input{border:none!important;background:transparent!important;box-shadow:none!important}

.cod-check{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:12.5px}
.cod-check input{position:absolute;opacity:0;width:0}
.cod-check-box{width:20px;height:20px;border:2px solid var(--cod-border);border-radius:6px;
  background:var(--cod-field);flex-shrink:0;position:relative;
  transition:background .22s var(--cod-ease),border-color .22s var(--cod-ease),transform .28s cubic-bezier(.34,1.42,.64,1)}
.cod-check input:checked+.cod-check-box{background:var(--cod-ok);border-color:var(--cod-ok);transform:scale(1.08)}
.cod-check input:checked+.cod-check-box::after{content:'';position:absolute;left:6px;top:2px;width:5px;height:10px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(45deg)}

/* ── Ubicación ── */
.cod-seg{position:relative;display:grid;grid-template-columns:1fr 1fr;padding:4px;background:#f2f2f2;
  border-radius:var(--cod-radius)}
.cod-glider{position:absolute;top:4px;left:4px;width:calc(50% - 4px);height:calc(100% - 8px);background:#fff;
  border-radius:calc(var(--cod-radius) - 3px);box-shadow:0 1px 4px rgba(0,0,0,.13);opacity:0;
  transition:transform .34s cubic-bezier(.34,1.42,.64,1),opacity .2s}
.cod-seg[data-active] .cod-glider{opacity:1}
.cod-seg[data-active="manual"] .cod-glider{transform:translate3d(100%,0,0)}
.cod-seg-btn{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:2px;
  padding:9px 5px;border:0;background:transparent;cursor:pointer;color:var(--cod-muted);font:inherit;
  transition:color .22s var(--cod-ease),transform .12s}
.cod-seg-btn:active{transform:scale(.96)}
.cod-seg-btn[aria-checked="true"]{color:var(--cod-text)}
.cod-seg-btn b{font-size:12px}.cod-seg-btn small{font-size:10px}
.cod-spinner-sm{display:none;width:15px;height:15px;border:2px solid rgba(0,0,0,.14);
  border-top-color:var(--cod-text);border-radius:50%;animation:cod-spin .65s linear infinite}
.cod-locating .cod-spinner-sm{display:block}
@keyframes cod-spin{to{transform:rotate(360deg)}}

.cod-map-panel{margin-top:9px}
.cod-map{position:relative;height:160px;border-radius:var(--cod-radius);overflow:hidden;
  border:1.5px solid var(--cod-border);background:#e9e7e2;user-select:none;
  transition:border-color .25s var(--cod-ease),box-shadow .25s var(--cod-ease)}
/* BLOQUEADO: el dedo hace scroll y NO mueve el pin sin querer. */
.cod-map-locked{touch-action:pan-y;cursor:default}
.cod-map-editing{touch-action:none;cursor:grab;border-color:var(--cod-brand);box-shadow:0 0 0 3.5px rgba(0,0,0,.08)}
.cod-map-editing.cod-grabbing{cursor:grabbing}
.cod-map-tiles{position:absolute;inset:0;will-change:transform}
.cod-map-tiles img{position:absolute;width:256px;height:256px;pointer-events:none;-webkit-user-drag:none}
.cod-map-acc{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;
  background:rgba(17,17,17,.1);border:1px solid rgba(17,17,17,.28);pointer-events:none;
  transition:width .4s var(--cod-ease),height .4s var(--cod-ease)}
.cod-map-pin{position:absolute;left:50%;top:50%;width:26px;height:34px;transform:translate(-50%,-100%);
  pointer-events:none;background:no-repeat center/contain;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 34'%3E%3Cpath d='M13 33s11-12.4 11-20A11 11 0 102 13c0 7.6 11 20 11 20z' fill='%23111'/%3E%3Ccircle cx='13' cy='12.5' r='4.3' fill='%23fff'/%3E%3C/svg%3E");
  filter:drop-shadow(0 3px 5px rgba(0,0,0,.32))}
.cod-map-lock{position:absolute;left:7px;bottom:7px;padding:4px 8px;border-radius:99px;
  background:rgba(255,255,255,.94);font-size:10px;font-weight:600;color:var(--cod-muted)}
.cod-map-editing .cod-map-lock{opacity:0}

.cod-locbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;
  padding:8px 11px;background:#eaf7ef;border-radius:var(--cod-radius);color:#12813c}
.cod-loc-addr{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cod-loc-coords{font-size:10px;opacity:.75;font-variant-numeric:tabular-nums;flex-shrink:0}

.cod-edit-btn{display:block;width:100%;margin-top:7px;padding:9px;border:1.5px solid var(--cod-border);
  background:var(--cod-field);border-radius:var(--cod-radius);font:inherit;font-size:12.5px;font-weight:600;
  color:var(--cod-muted);cursor:pointer;transition:all .16s var(--cod-ease)}
.cod-edit-btn:active{transform:scale(.97)}
.cod-edit-btn.cod-saving{background:var(--cod-brand);border-color:var(--cod-brand);color:#fff}

/* ── Submit ── */
.cod-form-error{font-size:12.5px;color:var(--cod-danger);margin-top:10px}
.cod-form-error:empty{display:none}
.cod-submit{width:100%;margin-top:14px;height:var(--cod-btn-height);display:flex;align-items:center;
  justify-content:center;gap:8px;background:var(--cod-btn-bg);color:var(--cod-btn-color);border:0;
  border-radius:var(--cod-btn-radius);font:inherit;font-size:var(--cod-btn-size);font-weight:700;cursor:pointer;
  transition:background .18s var(--cod-ease),transform .12s var(--cod-ease)}
.cod-submit:active{transform:scale(.985)}
.cod-submit.cod-ready{background:var(--cod-btn-ready)}
.cod-submit:disabled{opacity:.75;cursor:default}
.cod-submit-icon{font-size:1.1em;line-height:1}
.cod-submit-anim-pulse.cod-ready{animation:cod-sub-pulse 1.8s ease-in-out infinite}
@keyframes cod-sub-pulse{0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}50%{box-shadow:0 0 0 5px rgba(22,163,74,.18)}}
.cod-submit-anim-shine{position:relative;overflow:hidden}
.cod-submit-anim-shine::after{content:"";position:absolute;inset:0;
  background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.3) 50%,transparent 70%);
  transform:translateX(-100%);animation:cod-sub-shine 3s ease-in-out infinite}
@keyframes cod-sub-shine{0%,60%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.cod-spinner{display:none;width:15px;height:15px;border:2px solid rgba(255,255,255,.35);
  border-top-color:#fff;border-radius:50%;animation:cod-spin .65s linear infinite}
.cod-loading .cod-spinner{display:block}
.cod-loading .cod-submit-label,.cod-loading .cod-submit-icon{opacity:.7}
.cod-wa-btn{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:11px 20px;
  background:#25d366;color:#fff;border-radius:99px;font-weight:700;text-decoration:none;font-size:14px}
.cod-wa-btn:active{transform:scale(.97)}

/* ── Confirmación. SIN resumen: ni productos, ni cantidades, ni total. ── */
.cod-done{text-align:center;padding:26px 10px;animation:cod-in .45s var(--cod-ease) both}
.cod-done-tick{width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:#eaf7ef;
  display:grid;place-items:center;color:var(--cod-ok);
  animation:cod-pop .6s cubic-bezier(.34,1.42,.64,1) both}
.cod-done-tick svg{width:27px;height:27px;stroke-dasharray:26;stroke-dashoffset:26;
  animation:cod-draw .45s var(--cod-ease) .25s forwards}
@keyframes cod-pop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes cod-draw{to{stroke-dashoffset:0}}
.cod-done h3{margin:0 0 6px;font-size:19px}
.cod-done p{margin:0 0 18px;color:var(--cod-muted);font-size:13.5px}
.cod-done-bar{height:3px;background:#eee;border-radius:99px;overflow:hidden;max-width:180px;margin:0 auto 8px}
.cod-done-bar span{display:block;height:100%;background:var(--cod-ok);width:0;
  animation:cod-fill linear forwards}
@keyframes cod-fill{to{width:100%}}
.cod-done small{font-size:11px;color:var(--cod-muted)}

/* ── Order bumps / upsells / downsells ── */
.cod-addons{display:grid;gap:9px;margin-top:4px}
.cod-bump{display:flex;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;
  border:1.5px dashed var(--cod-brand);border-radius:var(--cod-radius);background:var(--cod-field);
  transition:background .18s var(--cod-ease),border-color .18s var(--cod-ease)}
.cod-bump-on{background:color-mix(in srgb,var(--cod-ok) 8%,#fff);border-style:solid;border-color:var(--cod-ok)}
.cod-bump input{position:absolute;opacity:0;width:0}
.cod-bump-box{flex-shrink:0;width:20px;height:20px;border:2px solid var(--cod-border);border-radius:6px;
  background:#fff;position:relative;transition:background .2s,border-color .2s}
.cod-bump input:checked+.cod-bump-box{background:var(--cod-ok);border-color:var(--cod-ok)}
.cod-bump input:checked+.cod-bump-box::after{content:'';position:absolute;left:6px;top:2px;width:5px;height:10px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(45deg)}
.cod-bump-img{width:38px;height:38px;object-fit:cover;border-radius:7px;flex-shrink:0}
.cod-bump-text{flex:1;min-width:0}
.cod-bump-text b{display:block;font-size:13px;line-height:1.3}
.cod-bump-text small{display:block;font-size:11.5px;color:var(--cod-muted);margin-top:1px}
.cod-bump-price{font-weight:700;font-size:13.5px;white-space:nowrap;flex-shrink:0}
.cod-bump-price s{color:var(--cod-muted);font-weight:400;margin-right:4px;font-size:11.5px}

.cod-upsell{display:flex;align-items:center;gap:11px;padding:11px 12px;border:1.5px solid var(--cod-border);
  border-radius:var(--cod-radius);background:var(--cod-surface);animation:cod-in .3s var(--cod-ease) both}
.cod-upsell-on{border-color:var(--cod-ok);background:color-mix(in srgb,var(--cod-ok) 6%,#fff)}
.cod-upsell-img{width:52px;height:52px;object-fit:cover;border-radius:8px;flex-shrink:0}
.cod-upsell-body{flex:1;min-width:0}
.cod-upsell-body b{display:block;font-size:13.5px;line-height:1.3}
.cod-upsell-body small{display:block;font-size:11.5px;color:var(--cod-muted);margin:1px 0 3px}
.cod-upsell-price{font-weight:700;font-size:14px}
.cod-upsell-price s{color:var(--cod-muted);font-weight:400;margin-right:5px;font-size:12px}
.cod-upsell-add{flex-shrink:0;padding:8px 16px;border:1.5px solid var(--cod-brand);background:var(--cod-brand);
  color:#fff;border-radius:99px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;
  transition:transform .12s var(--cod-ease)}
.cod-upsell-add:active{transform:scale(.94)}
.cod-upsell-on .cod-upsell-add{background:transparent;color:var(--cod-brand)}

/* ── Modal (modo popup) ── */
.cod-modal-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;
  justify-content:center;background:rgba(0,0,0,.5);opacity:0;transition:opacity .25s var(--cod-ease);
  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.cod-modal-overlay.cod-open{opacity:1}
@media(min-width:540px){.cod-modal-overlay{align-items:center}}
.cod-modal{position:relative;width:100%;max-width:440px;max-height:92vh;overflow-y:auto;
  background:var(--cod-surface);border-radius:20px 20px 0 0;padding:14px;
  transform:translateY(40px);transition:transform .32s cubic-bezier(.34,1.42,.64,1)}
@media(min-width:540px){.cod-modal{border-radius:18px}}
.cod-modal-overlay.cod-open .cod-modal{transform:none}
.cod-modal-close{position:absolute;top:12px;right:12px;z-index:2;width:32px;height:32px;border:0;
  border-radius:50%;background:rgba(0,0,0,.06);color:var(--cod-text);font-size:14px;cursor:pointer}
.cod-modal-body .cod-root{box-shadow:none;padding:8px}

@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
async function mount(opts) {
  const host = opts.container;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  shadow.appendChild(style);
  const root = document.createElement("div");
  root.className = "cod-root";
  shadow.appendChild(root);
  root.innerHTML = `<div class="cod-skeleton"><span></span><span></span><span></span></div>`;
  let config;
  try {
    config = await api.config(opts.productId, opts.variantId);
  } catch {
    host.remove();
    return;
  }
  style.textContent = `:host{${tokensToCss(config.tokens)}}
${CSS}
${config.tokens.customCss}`;
  const renderInto = (mountRoot) => {
    const state = new FormState(config);
    renderForm(mountRoot, config, state, {
      onSubmit: () => submit(mountRoot, config, state)
    });
  };
  if (host.dataset.mode === "popup") {
    const { renderTrigger } = await import("./trigger-B2THza9S.js");
    root.innerHTML = "";
    renderTrigger(root, config.tokens.trigger, () => openModal(config, renderInto));
    return;
  }
  root.innerHTML = "";
  renderInto(root);
  try {
    api.track(config.formId, "view", config.formVersionId);
  } catch {
  }
}
function openModal(config, renderInto) {
  const overlay = document.createElement("div");
  overlay.className = "cod-modal-overlay";
  const modal = document.createElement("div");
  modal.className = "cod-modal";
  modal.innerHTML = `<button class="cod-modal-close" aria-label="Cerrar">✕</button><div class="cod-modal-body"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => overlay.classList.add("cod-open"));
  const close = () => {
    overlay.classList.remove("cod-open");
    document.body.style.overflow = "";
    setTimeout(() => overlay.remove(), 250);
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector(".cod-modal-close").addEventListener("click", close);
  document.addEventListener("keydown", function esc2(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", esc2);
    }
  });
  renderInto(modal.querySelector(".cod-modal-body"));
}
class FormState {
  constructor(config) {
    this.config = config;
    this.values = {};
    this.qty = 1;
    this.location = null;
    this.discountCode = null;
    this.acceptedAddons = [];
    this.startedAt = Date.now();
    this.idempotencyKey = crypto.randomUUID();
    for (const f of config.fields) {
      if (f.defaultValue) this.values[f.key] = f.defaultValue;
    }
  }
  visibleFields() {
    return this.config.fields.filter((f) => isVisible(f, this.values));
  }
  /** Devuelve los errores por campo. Vacío = válido. */
  validate() {
    var _a;
    const errors = {};
    for (const f of this.visibleFields()) {
      const err = validateField(f, (_a = this.values[f.key]) != null ? _a : "");
      if (err) errors[f.key] = err;
    }
    return errors;
  }
}
async function submit(root, config, state) {
  const btn = root.querySelector(".cod-submit");
  const errBox = root.querySelector(".cod-form-error");
  btn.disabled = true;
  btn.classList.add("cod-loading");
  errBox.textContent = "";
  const payload = {
    formId: config.formId,
    formVersionId: config.formVersionId,
    idempotencyKey: state.idempotencyKey,
    variantId: config.product.variantId,
    qty: state.qty,
    discountCode: state.discountCode,
    acceptedAddons: state.acceptedAddons,
    fields: state.values,
    location: state.location,
    startedAt: state.startedAt,
    hp: ""
    // honeypot: si un bot lo rellena, el backend rechaza
  };
  try {
    const res = await api.submit(payload);
    try {
      api.track(config.formId, "submit_attempt", state.idempotencyKey);
    } catch {
    }
    showConfirmation(root, res);
  } catch (e) {
    btn.disabled = false;
    btn.classList.remove("cod-loading");
    errBox.textContent = e instanceof ApiError ? e.message : "No pudimos enviar tu pedido. Inténtalo de nuevo.";
    errBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
function showConfirmation(root, res) {
  var _a;
  const goWhatsapp = res.redirectTarget === "whatsapp" && !!res.whatsappUrl;
  const willRedirect = goWhatsapp || res.redirectTarget === "thankyou";
  const dest = goWhatsapp ? res.whatsappUrl : res.redirectUrl;
  if (res.purchasePixel) firePurchasePixel(res.purchasePixel);
  root.innerHTML = `
    <div class="cod-done">
      <div class="cod-done-tick">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"
             stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h3>${escapeHtml(res.title)}</h3>
      <p>${escapeHtml(res.message)}</p>
      ${willRedirect ? `<div class="cod-done-bar"><span style="animation-duration:${res.redirectDelayMs}ms"></span></div>
           <small>${goWhatsapp ? "Abriendo WhatsApp…" : "Redirigiendo…"}</small>` : ""}
      ${goWhatsapp ? `<a class="cod-wa-btn" href="${res.whatsappUrl}" target="_blank" rel="noopener">
             Continuar por WhatsApp</a>` : ""}
    </div>`;
  (_a = root.querySelector(".cod-done")) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "center" });
  if (willRedirect) {
    window.setTimeout(() => {
      window.location.assign(dest);
    }, res.redirectDelayMs);
  }
}
function firePurchasePixel(p) {
  var _a;
  const value = p.valueCents / 100;
  try {
    if (p.metaPixelId) {
      const w = window;
      if (!w.fbq) {
        (function(f, b, e, v) {
          if (f.fbq) return;
          const n = f.fbq = function() {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n;
          n.push = n;
          n.loaded = true;
          n.version = "2.0";
          n.queue = [];
          const t = b.createElement(e);
          t.async = true;
          t.src = v;
          const s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
        w.fbq("init", p.metaPixelId);
      }
      w.fbq("track", p.eventName, { currency: p.currency, value }, { eventID: p.eventId });
    }
    if (p.tiktokPixelId) {
      const w = window;
      (_a = w.ttq) == null ? void 0 : _a.track("CompletePayment", { currency: p.currency, value, event_id: p.eventId });
    }
  } catch {
  }
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function boot() {
  document.querySelectorAll("[data-cod-form]:not([data-cod-mounted])").forEach((el) => {
    el.dataset.codMounted = "1";
    void mount({
      productId: el.dataset.productId,
      variantId: el.dataset.variantId,
      container: el
    });
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
window.CodForm = { mount };
export {
  CSS as C,
  FormState as F,
  mount as m,
  renderForm as r,
  tokensToCss as t
};
