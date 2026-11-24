var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a;
const DIRECT = globalThis.__CODF__;
const BASE = (_a = DIRECT == null ? void 0 : DIRECT.api) != null ? _a : "/apps/cod";
function url(path) {
  if (!DIRECT) return `${BASE}${path}`;
  const q = `shop=${encodeURIComponent(DIRECT.shop)}&k=${encodeURIComponent(DIRECT.k)}`;
  return `${BASE}${path}${path.includes("?") ? "&" : "?"}${q}`;
}
async function call(path, init) {
  var _a2, _b;
  const headers = (init == null ? void 0 : init.body) == null ? {} : { "Content-Type": DIRECT ? "text/plain;charset=UTF-8" : "application/json" };
  const res = await fetch(url(path), { ...init, headers: { ...headers, ...(_a2 = init == null ? void 0 : init.headers) != null ? _a2 : {} } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Error de red" }));
    throw new ApiError(res.status, (_b = body.message) != null ? _b : "Error");
  }
  return res.json();
}
const configs = /* @__PURE__ */ new Map();
function loadConfig(productId, variantId) {
  var _a2;
  const q = `productId=${encodeURIComponent(productId)}&variantId=${encodeURIComponent(variantId)}`;
  let p = configs.get(q);
  if (!p) {
    const pre = (_a2 = DIRECT == null ? void 0 : DIRECT.pre) == null ? void 0 : _a2[q];
    const fresh = () => call(`/form?${q}`);
    p = pre ? pre.then((c) => c && c.formId ? c : fresh(), fresh) : fresh();
    configs.set(q, p);
    p.catch(() => configs.delete(q));
  }
  return p;
}
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const api = {
  config: (productId, variantId) => loadConfig(productId, variantId),
  quote: (body) => call("/quote", { method: "POST", body: JSON.stringify(body) }),
  /** La API key de Google no toca jamás el navegador. */
  reverse: (lat, lng) => call("/geo/reverse", { method: "POST", body: JSON.stringify({ lat, lng }) }),
  /**
   * Enviar el pedido. Si la conexión falla o el servidor está ocupado, se
   * reintenta solo (hasta 4 veces) con la MISMA clave: nunca se duplica y el
   * cliente no tiene que volver a pulsar.
   */
  submit: async (body) => {
    const waits = [600, 1500, 3e3, 5e3];
    for (let i = 0; ; i++) {
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 2e4) : 0;
      try {
        return await call("/submit", { method: "POST", body: JSON.stringify(body), signal: ctl == null ? void 0 : ctl.signal });
      } catch (e) {
        const retry = !(e instanceof ApiError) || e.status >= 500 || e.status === 429;
        if (!retry || i >= waits.length) throw e instanceof ApiError ? e : new ApiError(0, "Sin conexión. Revisa tu internet e inténtalo de nuevo.");
        await new Promise((r) => setTimeout(r, waits[i]));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  },
  /** Enlace de «Estado del pedido» de Shopify (cuando el pedido ya está creado). */
  orderStatus: (submissionId, key) => call("/order-status", { method: "POST", body: JSON.stringify({ submissionId, key }) }),
  /** Evento de embudo. sendBeacon no bloquea al cliente ni espera respuesta. */
  track: (formId, event, sessionId, field) => {
    const body = JSON.stringify({ formId, event, sessionId, field: field != null ? field : null, ts: Date.now() });
    try {
      if (navigator.sendBeacon) {
        const sent = DIRECT ? navigator.sendBeacon(url("/track"), new Blob([body], { type: "text/plain" })) : navigator.sendBeacon(`${BASE}/track${location.search}`, new Blob([body], { type: "application/json" }));
        if (sent) return;
      }
    } catch {
    }
    void fetch(url("/track"), { method: "POST", headers: { "Content-Type": DIRECT ? "text/plain;charset=UTF-8" : "application/json" }, body, keepalive: true });
  }
};
const shopRoot = () => {
  var _a2, _b, _c;
  return ((_c = (_b = (_a2 = window.Shopify) == null ? void 0 : _a2.routes) == null ? void 0 : _b.root) != null ? _c : "/").replace(/\/?$/, "/");
};
async function readCart() {
  return (await readCartFull()).lines;
}
async function readCartFull() {
  var _a2, _b, _c;
  const res = await fetch(`${shopRoot()}cart.js`, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("cart");
  const cart = await res.json();
  return { token: (_a2 = cart.token) != null ? _a2 : "", totalCents: (_b = cart.total_price) != null ? _b : 0, lines: ((_c = cart.items) != null ? _c : []).filter((i) => i.quantity > 0).slice(0, 50).map((i) => ({
    variantId: `gid://shopify/ProductVariant/${i.variant_id}`,
    productId: `gid://shopify/Product/${i.product_id}`,
    qty: Math.min(i.quantity, 99)
  })) };
}
function clearCart() {
  void fetch(`${shopRoot()}cart/clear.js`, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } }).then(() => document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }))).catch(() => void 0);
}
const ANIMATION_SPEEDS = { slow: 1.6, normal: 1, fast: 0.6 };
function buttonAnimationCss(cls, color) {
  const k = (n) => `${cls}-k-${n}`;
  const a = (n) => `.${cls}.${cls}-anim-${n}`;
  const d = (s) => `calc(${s}s * var(--anim-speed, 1))`;
  return `
.${cls}{position:relative;isolation:isolate}
.${cls}[class*="${cls}-anim-"]:not(.${cls}-anim-none){will-change:transform;backface-visibility:hidden}
${a("pulse")}{overflow:visible;animation:${k("pulse")} ${d(1.8)} ease-in-out infinite}
${a("pulse")}::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  box-shadow:0 0 0 7px color-mix(in srgb,${color} 40%,transparent);opacity:0;animation:${k("pulse-ring")} ${d(1.8)} ease-out infinite}
@keyframes ${k("pulse")}{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes ${k("pulse-ring")}{0%{transform:scale(.96);opacity:.9}70%,100%{transform:scale(1.06,1.2);opacity:0}}

${a("heartbeat")}{animation:${k("heartbeat")} ${d(2.2)} ease-in-out infinite}
@keyframes ${k("heartbeat")}{0%,40%,100%{transform:scale(1)}8%{transform:scale(1.08)}16%{transform:scale(.98)}24%{transform:scale(1.08)}32%{transform:scale(1)}}

${a("bounce")}{animation:${k("bounce")} ${d(2)} cubic-bezier(.28,.84,.42,1) infinite}
@keyframes ${k("bounce")}{0%,50%,100%{transform:translateY(0)}15%{transform:translateY(-10px)}28%{transform:translateY(0)}
  36%{transform:translateY(-4px)}44%{transform:translateY(0)}}

${a("float")}{animation:${k("float")} ${d(3)} ease-in-out infinite}
@keyframes ${k("float")}{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

${a("shake")}{animation:${k("shake")} ${d(2.8)} ease-in-out infinite}
@keyframes ${k("shake")}{0%,62%,100%{transform:translateX(0)}65%,71%,77%,83%{transform:translateX(-5px)}68%,74%,80%{transform:translateX(5px)}86%{transform:translateX(2px)}}

${a("wobble")}{animation:${k("wobble")} ${d(2.8)} ease-in-out infinite}
@keyframes ${k("wobble")}{0%,60%,100%{transform:rotate(0)}64%{transform:rotate(-4deg)}70%{transform:rotate(4deg)}
  76%{transform:rotate(-3deg)}82%{transform:rotate(2deg)}88%{transform:rotate(-1deg)}}

${a("jello")}{animation:${k("jello")} ${d(2.8)} ease-in-out infinite}
@keyframes ${k("jello")}{0%,60%,100%{transform:none}66%{transform:scale3d(1.18,.82,1)}72%{transform:scale3d(.88,1.12,1)}
  78%{transform:scale3d(1.06,.94,1)}84%{transform:scale3d(.97,1.03,1)}90%{transform:scale3d(1.01,.99,1)}}

${a("tada")}{animation:${k("tada")} ${d(3)} ease-in-out infinite}
@keyframes ${k("tada")}{0%,60%,100%{transform:none}63%,66%{transform:scale(.94) rotate(-3deg)}
  70%,78%,86%{transform:scale(1.07) rotate(3deg)}74%,82%{transform:scale(1.07) rotate(-3deg)}90%{transform:scale(1)}}

${a("shine")}{overflow:hidden}
${a("shine")}::after{content:"";position:absolute;inset:-2px;pointer-events:none;z-index:1;
  background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.6) 48%,rgba(255,255,255,.15) 55%,transparent 70%);
  transform:translateX(-120%);animation:${k("shine")} ${d(2.6)} ease-in-out infinite}
@keyframes ${k("shine")}{0%,45%{transform:translateX(-120%)}100%{transform:translateX(120%)}}

${a("glow")}{overflow:visible}
${a("glow")}::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  box-shadow:0 0 0 3px color-mix(in srgb,${color} 25%,transparent),0 0 26px 4px color-mix(in srgb,${color} 65%,transparent);
  opacity:.15;animation:${k("glow")} ${d(2.2)} ease-in-out infinite}
@keyframes ${k("glow")}{0%,100%{opacity:.15}50%{opacity:1}}

${a("ripple")}{overflow:visible}
${a("ripple")}::before,${a("ripple")}::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  border:2px solid ${color};animation:${k("ripple")} ${d(2.4)} cubic-bezier(.2,.6,.35,1) infinite}
${a("ripple")}::after{animation-delay:calc(1.2s * var(--anim-speed, 1))}
@keyframes ${k("ripple")}{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.18,1.45);opacity:0}}

@media (prefers-reduced-motion: reduce){.${cls},.${cls}::before,.${cls}::after{animation:none!important}}
`;
}
function buttonBackground(b) {
  var _a2, _b;
  const base = b.bgType === "gradient" ? `linear-gradient(${(_a2 = b.gradientAngle) != null ? _a2 : 135}deg, ${b.bg}, ${(_b = b.bg2) != null ? _b : b.bg})` : b.bg;
  return b.depth ? `linear-gradient(180deg, rgba(255,255,255,.26) 0%, rgba(255,255,255,.06) 48%, rgba(0,0,0,.12) 100%), ${base}` : base;
}
function buttonShadow(b) {
  var _a2, _b;
  const c = b.shadowColor || "#000000";
  const mix = (pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  const glow = b.depth && b.bg ? [`0 7px 9px color-mix(in srgb, ${b.bg} 45%, transparent)`, `0 2px 2px color-mix(in srgb, ${b.bg} 22%, transparent)`] : [];
  const base = (_b = {
    sm: [`0 2px 3px ${mix(30)}`],
    md: [`0 6px 10px ${mix(32)}`],
    lg: [`0 12px 20px ${mix(38)}`, `0 3px 5px ${mix(20)}`],
    none: []
  }[(_a2 = b.shadow) != null ? _a2 : "none"]) != null ? _b : [];
  const all = [...base, ...glow];
  return all.length ? all.join(", ") : "none";
}
function tokensToCss(t) {
  var _a2;
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
    --cod-btn-bg:${buttonBackground(t.submit)};
    --cod-btn-solid:${t.submit.bg};
    --cod-apply-bg:${t.applyBg};
    --cod-offer-accent:${t.offerCard.accent};
    ${t.offerCard.glow === false ? "--cod-offer-glow:none;" : ""}
    --cod-badge-from:${t.offerCard.badgeFrom};
    --cod-badge-to:${t.offerCard.badgeTo};
    --cod-badge-color:${t.offerCard.badgeColor};
    --cod-save-bg:${t.offerCard.saveBg};
    --cod-save-color:${t.offerCard.saveColor};
    --cod-apply-color:${t.applyColor};
    --cod-btn-shadow:${buttonShadow(t.submit)};
    --anim-speed:${ANIMATION_SPEEDS[(_a2 = t.submit.animationSpeed) != null ? _a2 : "normal"]};
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
  if (f.type === "location") {
    return f.required && !v ? "Elige cómo darnos tu dirección: tu ubicación o escribirla." : null;
  }
  if (f.type === "checkbox") {
    return f.required && v !== "true" ? "Marca esta casilla para continuar." : null;
  }
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
    var _a2;
    const v = (_a2 = values[c.field]) != null ? _a2 : "";
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
const BUTTON_ICONS = {
  cart: { label: "Carrito", svg: '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2.5 3h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L21 7H6"/>' },
  bag: { label: "Bolsa", svg: '<path d="M5 8h14l-1 12.2a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 20.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>' },
  truck: { label: "Envío", svg: '<path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 9.5h4l3.5 3.5v2.5h-7.5"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>' },
  cash: { label: "Efectivo", svg: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>' },
  "check-circle": { label: "Listo", svg: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>' },
  check: { label: "Visto", svg: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' },
  lock: { label: "Seguro", svg: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>' },
  shield: { label: "Garantía", svg: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.2-4.3"/>' },
  package: { label: "Paquete", svg: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>' },
  arrow: { label: "Flecha", svg: '<path d="M5 12h14M13 6l6 6-6 6"/>' },
  bolt: { label: "Rápido", svg: '<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z"/>' },
  gift: { label: "Regalo", svg: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5"/><path d="M12 8C9.5 8 7.5 7 7.5 5.3S9.6 3 12 8zM12 8c2.5 0 4.5-1 4.5-2.7S14.4 3 12 8z"/>' },
  tag: { label: "Oferta", svg: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/>' },
  heart: { label: "Corazón", svg: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>' },
  star: { label: "Estrella", svg: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/>' }
};
function buttonIconSvg(name, className = "") {
  const icon = BUTTON_ICONS[name];
  if (!icon) return "";
  return `<svg class="${className}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.svg}</svg>`;
}
function mountLocation(wrap, config, state, onChange) {
  const c = config.location;
  wrap.innerHTML = `
    <label>Dirección de entrega <span class="cod-req">*</span></label>
    <div class="cod-seg" role="radiogroup">
      <span class="cod-glider"></span>
      ${c.gpsEnabled ? `
      <button type="button" class="cod-seg-btn" data-mode="gps" role="radio" aria-checked="false">
        <span class="cod-seg-tag">★ Recomendado</span>
        <span class="cod-seg-ico"><span class="cod-spinner-sm"></span></span>
        <b>${esc$2(c.gpsLabel)}</b><small>${esc$2(c.gpsHint)}</small>
      </button>` : ""}
      ${c.manualEnabled ? `
      <button type="button" class="cod-seg-btn" data-mode="manual" role="radio" aria-checked="false">
        <span class="cod-seg-ico"></span>
        <b>${esc$2(c.manualLabel)}</b><small>${esc$2(c.manualHint)}</small>
      </button>` : ""}
    </div>

    <div class="cod-map-panel" hidden>
      <div class="cod-map cod-map-locked"><div class="cod-map-tiles"></div>
        <div class="cod-map-acc"></div><div class="cod-map-pin"></div>
        <span class="cod-map-lock">Ubicación fijada</span>
        <div class="cod-map-zoom"><button type="button" data-z="1" aria-label="Acercar">+</button><button type="button" data-z="-1" aria-label="Alejar">−</button></div>
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
  const key = wrap.dataset.key || "location";
  const setValue = (v) => {
    if (v) state.values[key] = v;
    else delete state.values[key];
  };
  segs.forEach((btn) => {
    btn.addEventListener("click", () => void setMode(btn.dataset.mode));
  });
  async function setMode(mode) {
    wrap.querySelector(".cod-seg").setAttribute("data-active", mode);
    segs.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
    errEl.textContent = "";
    errEl.classList.remove("cod-soft");
    wrap.classList.remove("cod-invalid");
    state.values.locationMode = mode;
    if (mode === "manual") {
      mapPanel.hidden = true;
      manualPanel.hidden = false;
      state.location = null;
      setValue("manual");
      onChange();
      return;
    }
    manualPanel.hidden = true;
    setValue("");
    onChange();
    await locate();
  }
  async function locate() {
    const gpsBtn = wrap.querySelector('[data-mode="gps"]');
    gpsBtn.classList.add("cod-locating");
    wrap.classList.remove("cod-picking");
    let pos;
    try {
      pos = await getPosition();
      report(config, "ok");
    } catch (e) {
      const err = e;
      report(config, failCode(err));
      gpsBtn.classList.remove("cod-locating");
      if (await pickOnMap(err)) return;
      await setMode("manual");
      errEl.textContent = await whyNoLocation(err, " Mientras, escribe tu dirección aquí abajo.");
      errEl.classList.add("cod-soft");
      return;
    }
    try {
      const { createMap } = await import("./map-DZEdKjFO.js");
      mapPanel.hidden = false;
      map == null ? void 0 : map.destroy();
      resetEdit();
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
    } catch {
      state.location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Math.round(pos.coords.accuracy),
        source: "GPS",
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    } finally {
      setValue("gps");
      void reverse(pos.coords.latitude, pos.coords.longitude);
      onChange();
      gpsBtn.classList.remove("cod-locating");
    }
  }
  async function pickOnMap(err) {
    let createMap;
    try {
      ({ createMap } = await import("./map-DZEdKjFO.js"));
    } catch {
      return false;
    }
    const addrEl = wrap.querySelector(".cod-loc-addr");
    const coordsEl = wrap.querySelector(".cod-loc-coords");
    wrap.classList.add("cod-picking");
    mapPanel.hidden = false;
    state.location = null;
    setValue("");
    const tip = "Acércalo con + y muévelo a tu casa";
    addrEl.textContent = tip;
    coordsEl.textContent = "";
    errEl.textContent = await whyNoLocation(err, " Márcala en el mapa o toca «" + c.manualLabel + "».");
    errEl.classList.add("cod-soft");
    const mapEl = wrap.querySelector(".cod-map");
    map == null ? void 0 : map.destroy();
    map = createMap(mapEl, {
      lat: COUNTRY_CENTER.lat,
      lng: COUNTRY_CENTER.lng,
      zoom: COUNTRY_ZOOM,
      onMove: (lat, lng) => {
        var _a2;
        if (((_a2 = map == null ? void 0 : map.zoom()) != null ? _a2 : 0) < PICK_MIN_ZOOM) {
          state.location = null;
          setValue("");
          addrEl.textContent = "Acércalo más (+) hasta ver tu calle";
          coordsEl.textContent = "";
          onChange();
          return;
        }
        state.location = { lat, lng, accuracyMeters: null, source: "MAP_PIN", capturedAt: (/* @__PURE__ */ new Date()).toISOString() };
        setValue("gps");
        errEl.textContent = "";
        void reverse(lat, lng);
        onChange();
      }
    });
    map.setEditing(true);
    const edit = wrap.querySelector(".cod-edit-btn");
    edit.textContent = "Guardar ubicación";
    edit.classList.add("cod-saving");
    onChange();
    return true;
  }
  function resetEdit() {
    const edit = wrap.querySelector(".cod-edit-btn");
    edit.textContent = "Editar ubicación";
    edit.classList.remove("cod-saving");
  }
  wrap.querySelectorAll(".cod-map-zoom button").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      map == null ? void 0 : map.zoomBy(Number(b.dataset.z));
    });
  });
  async function reverse(lat, lng) {
    var _a2;
    const addrEl = wrap.querySelector(".cod-loc-addr");
    const coordsEl = wrap.querySelector(".cod-loc-coords");
    coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    addrEl.textContent = "Buscando dirección…";
    try {
      const r = await api.reverse(lat, lng);
      addrEl.textContent = (_a2 = r.formatted) != null ? _a2 : "Ubicación marcada";
      if (r.provinceCode) state.values.provinceCode = r.provinceCode;
      if (r.city) state.values.city = r.city;
      if (r.district) state.values.sector = r.district;
      if (r.street) state.values.street = [r.street, r.number].filter(Boolean).join(" ");
      onChange();
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
async function whyNoLocation(e, tail) {
  const inFrame = (() => {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  })();
  const policy = document.featurePolicy;
  if (inFrame && policy && !policy.allowsFeature("geolocation")) {
    return "La vista previa del editor no permite pedir la ubicación. Pruébalo en la tienda (botón «Ver tienda»)." + tail;
  }
  if (!navigator.geolocation || !window.isSecureContext) return "Este navegador no permite usar la ubicación." + tail;
  const code = e == null ? void 0 : e.code;
  const app = inAppBrowser();
  if (code === 1 && app) {
    return `${app === "ig" ? "Instagram" : "Facebook"} no dejó usar tu ubicación.` + tail;
  }
  if (code === 1) {
    let state = "";
    try {
      state = (await navigator.permissions.query({ name: "geolocation" })).state;
    } catch {
    }
    return (state === "denied" ? "La ubicación está bloqueada para esta tienda. Actívala tocando el candado junto a la dirección de la página." : "No se dio permiso para usar tu ubicación.") + tail;
  }
  if (code === 2) return "No se pudo saber tu ubicación. Revisa que la ubicación esté activada en tu teléfono o computadora." + tail;
  if (code === 3) return "La ubicación tardó demasiado. Inténtalo otra vez." + tail;
  return "Sin acceso a tu ubicación." + tail;
}
const COUNTRY_CENTER = { lat: 18.82, lng: -70.3 };
const COUNTRY_ZOOM = 8;
const PICK_MIN_ZOOM = 15;
async function getPosition() {
  if (!navigator.geolocation) throw new Error("sin soporte");
  const ask = (o) => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, o);
  });
  try {
    return await ask({ enableHighAccuracy: true, timeout: 1e4, maximumAge: 12e4 });
  } catch (e) {
    if (e.code === 1) throw e;
    return ask({ enableHighAccuracy: false, timeout: 1e4, maximumAge: 3e5 });
  }
}
function inAppBrowser() {
  const ua = navigator.userAgent || "";
  if (/Instagram/i.test(ua)) return "ig";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua)) return "fb";
  return null;
}
function failCode(e) {
  const code = e == null ? void 0 : e.code;
  if (!navigator.geolocation || !window.isSecureContext) return "unsupported";
  return code === 1 ? "denied" : code === 2 ? "unavailable" : code === 3 ? "timeout" : "error";
}
function report(config, outcome) {
  var _a2;
  try {
    const inFrame = (() => {
      try {
        return window.top !== window.self;
      } catch {
        return true;
      }
    })();
    if (inFrame) return;
    const ua = navigator.userAgent || "";
    const os = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "desktop";
    api.track(config.formId, "location", config.formVersionId, `${outcome}:${(_a2 = inAppBrowser()) != null ? _a2 : "web"}-${os}`);
  } catch {
  }
}
const esc$2 = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
const ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
const getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
const ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
class ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
}
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};
const errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
let overrideErrorMap = errorMap;
function getErrorMap() {
  return overrideErrorMap;
}
const makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === errorMap ? void 0 : errorMap
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
class ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
}
const INVALID = Object.freeze({
  status: "aborted"
});
const DIRTY = (value) => ({ status: "dirty", value });
const OK = (value) => ({ status: "valid", value });
const isAborted = (x) => x.status === "aborted";
const isDirty = (x) => x.status === "dirty";
const isValid = (x) => x.status === "valid";
const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message == null ? void 0 : message.message;
})(errorUtil || (errorUtil = {}));
class ParseInputLazyPath {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
}
const handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    var _a2, _b;
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message != null ? message : ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: (_a2 = message != null ? message : required_error) != null ? _a2 : ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: (_b = message != null ? message : invalid_type_error) != null ? _b : ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
class ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    var _a2;
    const ctx = {
      common: {
        issues: [],
        async: (_a2 = params == null ? void 0 : params.async) != null ? _a2 : false,
        contextualErrorMap: params == null ? void 0 : params.errorMap
      },
      path: (params == null ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    var _a2, _b;
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if ((_b = (_a2 = err == null ? void 0 : err.message) == null ? void 0 : _a2.toLowerCase()) == null ? void 0 : _b.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params == null ? void 0 : params.errorMap,
        async: true
      },
      path: (params == null ? void 0 : params.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError2 = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError2();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError2();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
const cuidRegex = /^c[^\s-]{8,}$/i;
const cuid2Regex = /^[0-9a-z]+$/;
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
const nanoidRegex = /^[a-z0-9_-]{21}$/i;
const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
let emojiRegex;
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
const base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && (decoded == null ? void 0 : decoded.typ) !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
class ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    var _a2, _b;
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof (options == null ? void 0 : options.precision) === "undefined" ? null : options == null ? void 0 : options.precision,
      offset: (_a2 = options == null ? void 0 : options.offset) != null ? _a2 : false,
      local: (_b = options == null ? void 0 : options.local) != null ? _b : false,
      ...errorUtil.errToObj(options == null ? void 0 : options.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof (options == null ? void 0 : options.precision) === "undefined" ? null : options == null ? void 0 : options.precision,
      ...errorUtil.errToObj(options == null ? void 0 : options.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options == null ? void 0 : options.position,
      ...errorUtil.errToObj(options == null ? void 0 : options.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodString.create = (params) => {
  var _a2;
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: (_a2 = params == null ? void 0 : params.coerce) != null ? _a2 : false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
class ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
}
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: (params == null ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
class ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodBigInt.create = (params) => {
  var _a2;
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: (_a2 = params == null ? void 0 : params.coerce) != null ? _a2 : false,
    ...processCreateParams(params)
  });
};
class ZodBoolean extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: (params == null ? void 0 : params.coerce) || false,
    ...processCreateParams(params)
  });
};
class ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
}
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: (params == null ? void 0 : params.coerce) || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
class ZodSymbol extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
class ZodUndefined extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
class ZodNull extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
class ZodAny extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
class ZodUnknown extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
class ZodNever extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
}
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
class ZodVoid extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
class ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
class ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") ;
      else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          var _a2, _b, _c, _d;
          const defaultError = (_c = (_b = (_a2 = this._def).errorMap) == null ? void 0 : _b.call(_a2, issue, ctx).message) != null ? _c : ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: (_d = errorUtil.errToObj(message).message) != null ? _d : defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
}
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
class ZodUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
}
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
class ZodIntersection extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
}
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
class ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new ZodTuple({
      ...this._def,
      rest
    });
  }
}
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
class ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
}
class ZodMap extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
}
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
class ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
class ZodLazy extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
}
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
class ZodLiteral extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
}
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
class ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
}
ZodEnum.create = createZodEnum;
class ZodNativeEnum extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
}
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
class ZodPromise extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
}
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
class ZodEffects extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
}
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
class ZodOptional extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
class ZodNullable extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
class ZodDefault extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
class ZodCatch extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
}
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
class ZodNaN extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
}
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
class ZodBranded extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
}
class ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
}
class ZodReadonly extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
const stringType = ZodString.create;
const numberType = ZodNumber.create;
const booleanType = ZodBoolean.create;
const nullType = ZodNull.create;
const unknownType = ZodUnknown.create;
ZodNever.create;
const arrayType = ZodArray.create;
const objectType = ZodObject.create;
const unionType = ZodUnion.create;
ZodIntersection.create;
ZodTuple.create;
const recordType = ZodRecord.create;
const literalType = ZodLiteral.create;
const enumType = ZodEnum.create;
ZodPromise.create;
ZodOptional.create;
ZodNullable.create;
const LocationSourceSchema = enumType(["GPS", "MAP_PIN", "MANUAL", "NONE"]);
const LocationSchema = objectType({
  lat: numberType().min(-90).max(90),
  lng: numberType().min(-180).max(180),
  accuracyMeters: numberType().nonnegative().nullable().optional(),
  source: LocationSourceSchema,
  capturedAt: stringType().datetime()
});
const FieldTypeSchema = enumType([
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "time",
  "select",
  "checkbox",
  "radio",
  "multiselect",
  "heading",
  "subheading",
  "richtext",
  "divider",
  "html",
  "image",
  "video",
  "location",
  "map",
  "file",
  "discount"
]);
const ConditionSchema = objectType({
  field: stringType(),
  op: enumType(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "notEmpty"]),
  value: unknownType().optional()
});
const FieldSchema = objectType({
  key: stringType().min(1),
  type: FieldTypeSchema,
  label: stringType().default(""),
  placeholder: stringType().default(""),
  help: stringType().default(""),
  required: booleanType().default(false),
  defaultValue: stringType().nullable().default(null),
  width: enumType(["25", "33", "50", "66", "75", "100"]).default("100"),
  order: numberType().int().default(0),
  visible: booleanType().default(true),
  options: arrayType(objectType({ label: stringType(), value: stringType() })).default([]),
  validation: objectType({
    minLength: numberType().int().nullable().default(null),
    maxLength: numberType().int().nullable().default(null),
    regex: stringType().nullable().default(null),
    message: stringType().nullable().default(null)
  }).default({ minLength: null, maxLength: null, regex: null, message: null }),
  /** Se muestra solo si TODAS estas condiciones se cumplen. */
  conditions: arrayType(ConditionSchema).default([]),
  /** Contenido para bloques no-input (heading, html, image…). */
  content: stringType().default(""),
  /**
   * Aspecto del texto: títulos, subtítulos y párrafos (icono, color, alineación,
   * tamaño) y, en los campos, el icono y el color de su título.
   */
  look: objectType({
    icon: stringType().default(""),
    color: stringType().default(""),
    align: enumType(["left", "center", "right"]).default("left"),
    size: enumType(["sm", "md", "lg"]).default("md")
  }).optional()
});
const TriggerButtonSchema = objectType({
  text: stringType().default("Comprar ahora"),
  /** '' = ancho automático; '100%' = ancho completo; o un valor en px. */
  width: stringType().default("auto"),
  height: numberType().int().min(36).max(96).default(52),
  fontSize: numberType().min(12).max(28).default(15),
  descriptionFontSize: numberType().min(9).max(18).default(12),
  bg: stringType().default("#111111"),
  color: stringType().default("#ffffff"),
  /** Fondo: color sólido o degradado entre `bg` y `bg2`. */
  bgType: enumType(["solid", "gradient"]).default("solid"),
  bg2: stringType().default("#4f46e5"),
  gradientAngle: numberType().int().min(0).max(360).default(135),
  /** Sombra del botón (se combina con cualquier animación). */
  shadow: enumType(["none", "sm", "md", "lg"]).default("none"),
  shadowColor: stringType().default("#000000"),
  /** Efecto de profundidad (botón «real»: brillo arriba, sombra del color del botón, se hunde al tocarlo). */
  depth: booleanType().default(false),
  radius: numberType().int().min(0).max(60).default(60),
  /** Icono: un emoji/carácter, o una URL de imagen si iconType === 'image'. */
  iconType: enumType(["none", "emoji", "image", "svg"]).default("svg"),
  icon: stringType().default("🛒"),
  /** Icono del sistema (iconType === 'svg'): nombre de BUTTON_ICONS. */
  iconName: stringType().default("cart"),
  iconImageUrl: stringType().nullable().default(null),
  /** Hasta 5 descripciones que rotan bajo el título (carrusel). */
  descriptions: arrayType(stringType()).max(5).default([
    "Envío gratis a todo el país",
    "Pago contra entrega"
  ]),
  descriptionIntervalMs: numberType().int().min(1e3).max(1e4).default(3e3),
  animation: enumType(["none", "pulse", "heartbeat", "bounce", "float", "shake", "wobble", "jello", "tada", "shine", "glow", "ripple"]).catch("pulse").default("pulse"),
  animationSpeed: enumType(["slow", "normal", "fast"]).default("normal")
});
const SubmitButtonSchema = objectType({
  text: stringType().default("Finalizar pedido"),
  height: numberType().int().min(38).max(72).default(48),
  fontSize: numberType().min(12).max(24).default(15),
  radius: numberType().int().min(0).max(40).default(12),
  bg: stringType().default("#111111"),
  color: stringType().default("#ffffff"),
  /** Fondo: color sólido o degradado entre `bg` y `bg2`. */
  bgType: enumType(["solid", "gradient"]).default("solid"),
  bg2: stringType().default("#4f46e5"),
  gradientAngle: numberType().int().min(0).max(360).default(135),
  /** Sombra del botón (se combina con cualquier animación). */
  shadow: enumType(["none", "sm", "md", "lg"]).default("none"),
  shadowColor: stringType().default("#000000"),
  /** Efecto de profundidad (botón «real»: brillo arriba, sombra del color del botón, se hunde al tocarlo). */
  depth: booleanType().default(false),
  /** Color al que cambia cuando el formulario está completo. */
  readyBg: stringType().default("#16a34a"),
  iconType: enumType(["none", "emoji", "svg"]).default("none"),
  icon: stringType().default("→"),
  /** Icono del sistema (iconType === 'svg'): nombre de BUTTON_ICONS. */
  iconName: stringType().default("check-circle"),
  animation: enumType(["none", "pulse", "heartbeat", "bounce", "float", "shake", "wobble", "jello", "tada", "shine", "glow", "ripple"]).catch("none").default("none"),
  /** Precio dentro del botón: «Finalizar pedido · RD$ 2,140». Lo calcula el servidor. */
  priceDisplay: enumType(["none", "total", "subtotal"]).default("none"),
  animationSpeed: enumType(["slow", "normal", "fast"]).default("normal")
});
const ConfirmationSchema = objectType({
  title: stringType().default("¡Pedido confirmado!"),
  message: stringType().default("Te contactamos por WhatsApp para coordinar la entrega."),
  /** A dónde va el cliente tras confirmar. */
  redirectTarget: enumType(["thankyou", "whatsapp", "none"]).default("thankyou"),
  whatsapp: objectType({
    enabled: booleanType().default(false),
    /** E.164 sin el '+', como exige wa.me. Ej: 18095551234 */
    phone: stringType().default(""),
    /** Plantilla con variables: {nombre} {telefono} {pedido} {total} */
    messageTemplate: stringType().default("Hola, soy {nombre} y ya realicé mi pedido {pedido}.")
  }).default({ enabled: false, phone: "", messageTemplate: "Hola, soy {nombre} y ya realicé mi pedido {pedido}." })
});
const AntifraudSettingsSchema = objectType({
  /** Pedidos con riesgo >= este umbral se RETIENEN para revisión manual. */
  holdHighRisk: booleanType().default(false),
  riskThreshold: numberType().int().min(0).max(100).default(50),
  /** Máximo de pedidos por teléfono en 24 h (0 = sin límite). */
  maxOrdersPerPhonePerDay: numberType().int().min(0).default(0),
  /** Cloudflare Turnstile (CAPTCHA invisible). Vacío = desactivado. */
  turnstileSiteKey: stringType().default(""),
  turnstileSecret: stringType().default("")
});
const TrackingSettingsSchema = objectType({
  metaPixelId: stringType().default(""),
  /** Token de la Conversions API de Meta. Vive en el servidor, nunca en el widget. */
  metaCapiToken: stringType().default(""),
  /** Test event code de Meta, para depurar en el Events Manager. */
  metaTestCode: stringType().default(""),
  tiktokPixelId: stringType().default(""),
  tiktokToken: stringType().default(""),
  ga4MeasurementId: stringType().default(""),
  ga4ApiSecret: stringType().default(""),
  /** Nombre del evento de conversión. Purchase por defecto. */
  purchaseEventName: stringType().default("Purchase")
});
objectType({
  formId: stringType(),
  event: enumType(["view", "start", "field_error", "submit_attempt", "abandon", "location"]),
  /** Campo donde ocurrió (para saber dónde abandonan). */
  field: stringType().nullable().optional(),
  sessionId: stringType(),
  ts: numberType().int().optional()
});
const ThemeTokensSchema = objectType({
  brand: stringType().default("#111111"),
  success: stringType().default("#16a34a"),
  danger: stringType().default("#e53935"),
  surface: stringType().default("#ffffff"),
  field: stringType().default("#fafafa"),
  border: stringType().default("#e4e4e4"),
  text: stringType().default("#111111"),
  muted: stringType().default("#8a8a8a"),
  fontFamily: stringType().default('-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'),
  fontSize: numberType().default(14.5),
  radius: numberType().default(10),
  buttonRadius: numberType().default(12),
  buttonHeight: numberType().default(48),
  buttonText: stringType().default("Finalizar pedido"),
  shadow: enumType(["none", "sm", "md", "lg"]).default("md"),
  spacing: enumType(["compact", "normal", "relaxed"]).default("compact"),
  animations: booleanType().default(true),
  progressBar: booleanType().default(true),
  progressColor: stringType().default("#16a34a"),
  /** Tarjetas de ofertas por cantidad. */
  offerCard: objectType({
    accent: stringType().default("#4f6b94"),
    /** Brillo suave alrededor de la tarjeta elegida (false = solo el contorno). */
    glow: booleanType().default(true),
    badgeFrom: stringType().default("#4f6b94"),
    badgeTo: stringType().default("#8fb06e"),
    badgeColor: stringType().default("#ffffff"),
    saveBg: stringType().default("#e3ecd9"),
    saveColor: stringType().default("#3f6b2a"),
    showCompare: booleanType().default(true),
    showSave: booleanType().default(true),
    /** false = las tarjetas no salen en el formulario (la tienda tiene su propia
     *  caja de ofertas): el precio de la oferta se aplica igual con la cantidad
     *  que el cliente eligió en la página. */
    showInForm: booleanType().default(true)
  }).default({}),
  /** Botón «Aplicar» del código de descuento. */
  applyBg: stringType().default("#111111"),
  applyColor: stringType().default("#ffffff"),
  /** Efecto de profundidad en el botón «Aplicar». */
  applyDepth: booleanType().default(false),
  /** Color del botón de envío cuando el formulario está completo. */
  readyColor: stringType().default("#16a34a"),
  logoUrl: stringType().nullable().default(null),
  darkMode: booleanType().default(false),
  /** Cómo aparece el formulario al tocar el botón: desde abajo, ventana flotante o página completa. */
  display: enumType(["sheet", "popup", "page"]).default("sheet"),
  customCss: stringType().default(""),
  /** Botones (trigger y submit) totalmente configurables. */
  trigger: TriggerButtonSchema.default({}),
  submit: SubmitButtonSchema.default({})
});
const LocationConfigSchema = objectType({
  enabled: booleanType().default(true),
  gpsEnabled: booleanType().default(true),
  manualEnabled: booleanType().default(true),
  requireLocation: booleanType().default(false),
  lockAfterCapture: booleanType().default(true),
  defaultCenter: objectType({ lat: numberType(), lng: numberType() }).default({ lat: 18.4861, lng: -69.9312 }),
  defaultZoom: numberType().int().min(10).max(19).default(17),
  gpsLabel: stringType().default("Usar mi ubicación actual"),
  gpsHint: stringType().default("Tomada del mapa, precisa"),
  manualLabel: stringType().default("Escribirla"),
  manualHint: stringType().default("La escribes tú mismo")
});
const ShopSettingsSchema = objectType({
  /** Página de gracias del TEMA. Nunca una URL fija en el código. */
  thankYouUrl: stringType().default("/pages/gracias"),
  redirectDelayMs: numberType().int().min(0).max(15e3).default(3e3),
  orderTag: stringType().default("COD"),
  gateway: stringType().default("Cash on Delivery (COD)"),
  currency: stringType().default("DOP"),
  freeShippingOverCents: numberType().int().nullable().default(null),
  /** Sin configurar = 0: nunca se cobra un envío que el comerciante no puso. */
  defaultShippingCents: numberType().int().default(0),
  /** Tarifa de envío por provincia (código DO-XX → centavos). Si falta, usa la default. */
  shippingByProvince: recordType(stringType(), numberType().int()).default({}),
  /** Recargo por pagar contra entrega (COD fee). 0 = sin recargo. */
  codFeeCents: numberType().int().min(0).default(0),
  codFeeLabel: stringType().default("Recargo contra entrega"),
  /** El cliente NUNCA ve el resumen del pedido. Solo el admin, en el panel. */
  showOrderSummaryToCustomer: booleanType().default(false),
  /** Pantalla final + redirección (incluye WhatsApp). */
  confirmation: ConfirmationSchema.default({}),
  antifraud: AntifraudSettingsSchema.default({}),
  tracking: TrackingSettingsSchema.default({}),
  /** Tiendas conectadas desde Figui: dónde pone la app el botón en la tienda. */
  storefront: objectType({
    /** Botón fijo debajo de «Agregar al carrito» (o del precio). */
    autoPlace: booleanType().default(true),
    /** Botón flotante abajo de la pantalla al bajar (solo donde hay un botón fijo). */
    floating: booleanType().default(true),
    /** Botón «Comprar ahora» en el carrito (página y carrito lateral): cobra todo el carrito. */
    cartButton: booleanType().default(true)
  }).default({})
});
const ProvinceRuleSchema = objectType({
  mode: enumType(["all", "only", "except"]).catch("all").default("all"),
  codes: arrayType(stringType().max(12)).max(64).catch([]).default([])
}).catch({ mode: "all", codes: [] }).default({ mode: "all", codes: [] });
function provinceAllows(rule, province) {
  var _a2, _b;
  const mode = (_a2 = rule == null ? void 0 : rule.mode) != null ? _a2 : "all";
  const codes = (_b = rule == null ? void 0 : rule.codes) != null ? _b : [];
  if (mode === "all" || !codes.length) return true;
  const p = (province != null ? province : "").trim().toUpperCase();
  if (mode === "only") return !!p && codes.includes(p);
  return !p || !codes.includes(p);
}
const OfferSchema = objectType({
  id: stringType(),
  type: enumType(["QUANTITY", "FREE_SHIPPING", "PERCENTAGE"]),
  minQty: numberType().int().min(1),
  /** Basis points: 1000 = 10 %. Enteros, nada de floats con dinero. */
  discountBps: numberType().int().min(0).max(1e4).default(0),
  freeShipping: booleanType().default(false),
  label: stringType(),
  /** Tarjeta: «2 unidades» / «Ideal para regalar». */
  title: stringType().default(""),
  subtitle: stringType().default(""),
  /** Cinta destacada, p. ej. «MÁS VENDIDO». Vacío = sin cinta. */
  badge: stringType().default(""),
  /** Precio fijo del paquete (en vez de %). Null = usa discountBps. */
  bundlePriceCents: numberType().int().min(0).nullable().default(null),
  /** Monto fijo que se descuenta al paquete (RD$ 200 menos). 0 = no. */
  discountCents: numberType().int().min(0).default(0),
  /** Productos en los que vale (gid://shopify/Product/…). Vacío = todos. */
  productIds: arrayType(stringType()).default([]),
  /** Esta tarjeta viene marcada al abrir el formulario. */
  preselected: booleanType().default(false),
  /** Provincias donde sale esta oferta. */
  provinces: ProvinceRuleSchema,
  /**
   * Aspecto de esta tarjeta (como los extras). Colores vacíos = los del
   * diseño del formulario, así las ofertas de antes se ven igual.
   */
  style: objectType({
    border: enumType(["solid", "dashed", "none"]).catch("solid").default("solid"),
    borderColor: stringType().max(20).catch("").default(""),
    bg: stringType().max(20).catch("").default(""),
    /** Animación para llamar la atención (se detiene en la tarjeta elegida). */
    animation: enumType(["none", "march", "shine", "pulse", "glow", "shake"]).catch("none").default("none"),
    animationSpeed: enumType(["slow", "normal", "fast"]).catch("normal").default("normal"),
    /** Color de la cinta (vacío = el degradado del diseño). */
    badgeColor: stringType().max(20).catch("").default(""),
    badgeSide: enumType(["left", "right"]).catch("right").default("right"),
    /** Cuenta regresiva en la cinta, en minutos (0 = sin reloj). Por visitante; vuelve a empezar en cero. */
    badgeTimer: numberType().int().min(0).max(1440).catch(0).default(0)
  }).default({})
});
const AddonSchema = objectType({
  id: stringType(),
  kind: enumType(["ORDER_BUMP", "UPSELL", "DOWNSELL"]),
  /** gid://shopify/ProductVariant/… — null = cargo extra sin producto (p. ej. «Envío express»). */
  variantId: stringType().nullable().default(null),
  title: stringType(),
  description: stringType().default(""),
  image: stringType().nullable().default(null),
  /** Precio con el que se muestra (informativo). El servidor recalcula. */
  priceCents: numberType().int(),
  compareAtCents: numberType().int().nullable().default(null),
  qty: numberType().int().min(1).default(1),
  /** Para downsell: id del upsell al que reemplaza si se rechaza. */
  replacesId: stringType().nullable().default(null),
  /** Se muestra solo si el carrito supera este umbral (0 = siempre). */
  minCartCents: numberType().int().default(0),
  /** Provincias donde sale este extra. */
  provinces: ProvinceRuleSchema,
  /** Aspecto de la tarjeta. El título admite **negritas** y {precio}. */
  style: objectType({
    border: enumType(["dashed", "solid", "none"]).default("dashed"),
    borderColor: stringType().default("#94b07f"),
    bg: stringType().default("#f7faf3"),
    /** Animación para llamar la atención (se detiene al marcarla). */
    animation: enumType(["none", "march", "shine", "pulse", "glow", "shake"]).catch("none").default("none"),
    animationSpeed: enumType(["slow", "normal", "fast"]).catch("normal").default("normal"),
    /** Etiqueta que sobresale arriba de la tarjeta («🔥 Oferta flash»). Vacía = sin etiqueta. */
    badgeText: stringType().max(40).catch("").default(""),
    badgeColor: stringType().max(20).catch("#e11d48").default("#e11d48"),
    badgeSide: enumType(["left", "right"]).catch("right").default("right"),
    /** Cuenta regresiva en la etiqueta, en minutos (0 = sin reloj). Es por visitante y vuelve a empezar al llegar a cero. */
    badgeTimer: numberType().int().min(0).max(1440).catch(0).default(0)
  }).default({})
});
const AcceptedAddonSchema = objectType({
  id: stringType(),
  variantId: stringType().nullable(),
  qty: numberType().int().min(1)
});
objectType({
  formId: stringType(),
  formVersionId: stringType(),
  fields: arrayType(FieldSchema),
  tokens: ThemeTokensSchema,
  location: LocationConfigSchema,
  settings: ShopSettingsSchema,
  offers: arrayType(OfferSchema).default([]),
  addons: arrayType(AddonSchema).default([]),
  /** Cómo se muestra: el formulario en la página o un botón que lo abre en ventana. */
  displayMode: enumType(["EMBEDDED", "POPUP"]).default("EMBEDDED"),
  product: objectType({
    variantId: stringType(),
    title: stringType(),
    unitPriceCents: numberType().int(),
    image: stringType().nullable()
  })
});
const CartLineSchema = objectType({
  variantId: stringType(),
  qty: numberType().int().min(1).max(99)
});
objectType({
  formId: stringType(),
  variantId: stringType(),
  qty: numberType().int().min(1).max(50),
  province: stringType().nullable().optional(),
  discountCode: stringType().max(64).nullable().optional(),
  /** IDs de addons aceptados (order bumps / upsells / downsells). */
  addonIds: arrayType(stringType()).default([]),
  /** Si viene, se cobra TODO el carrito (variantId/qty se ignoran). */
  cart: arrayType(CartLineSchema).min(1).max(50).optional(),
  /** Token del carrito de la tienda: el servidor lee ese carrito y cobra SU total. */
  cartToken: stringType().max(300).optional(),
  /** Total del carrito que vio el cliente (solo si el servidor no puede leerlo). */
  cartTotalCents: numberType().int().min(0).optional()
});
objectType({
  subtotalCents: numberType().int(),
  discountCents: numberType().int(),
  shippingCents: numberType().int(),
  addonsCents: numberType().int().default(0),
  codFeeCents: numberType().int().default(0),
  totalCents: numberType().int(),
  currency: stringType(),
  appliedOffer: stringType().nullable(),
  appliedDiscount: objectType({
    code: stringType(),
    source: enumType(["SHOPIFY", "APP"]),
    label: stringType()
  }).nullable()
});
objectType({
  formId: stringType(),
  formVersionId: stringType(),
  idempotencyKey: stringType().uuid(),
  variantId: stringType(),
  qty: numberType().int().min(1).max(50),
  discountCode: stringType().max(64).nullable().optional(),
  /** Addons aceptados: se convierten en líneas extra del pedido. */
  acceptedAddons: arrayType(AcceptedAddonSchema).default([]),
  /** Pedido desde el carrito: todas sus líneas (variantId/qty se ignoran). */
  cart: arrayType(CartLineSchema).min(1).max(50).optional(),
  cartToken: stringType().max(300).optional(),
  cartTotalCents: numberType().int().min(0).optional(),
  /** Valores de los campos dinámicos, indexados por `key`. */
  fields: recordType(stringType(), unionType([stringType(), numberType(), booleanType(), nullType()])),
  location: LocationSchema.nullable(),
  /** Solo para detectar manipulación. El servidor SIEMPRE recalcula. */
  clientTotals: objectType({ totalCents: numberType().int() }).nullable().optional(),
  /** Anti-bot: debe venir vacío. */
  hp: stringType().max(0).optional(),
  startedAt: numberType().int().optional(),
  /** Datos del navegador para que Meta reconozca la compra (cookies _fbp/_fbc y la página). */
  attribution: objectType({
    fbp: stringType().max(200).optional(),
    fbc: stringType().max(400).optional(),
    url: stringType().max(1e3).optional()
  }).optional()
});
objectType({
  ok: literalType(true),
  submissionId: stringType(),
  /** Texto de la pantalla final (editable desde el panel). */
  title: stringType(),
  message: stringType(),
  /** 'thankyou' | 'whatsapp' | 'none' */
  redirectTarget: enumType(["thankyou", "whatsapp", "none"]),
  /** Página de gracias del tema, ya resuelta. */
  redirectUrl: stringType(),
  /** URL wa.me lista (número + mensaje con variables sustituidas), o null. */
  whatsappUrl: stringType().nullable(),
  redirectDelayMs: numberType().int(),
  /** Píxel de compra (client-side). El eventId se comparte con el CAPI para deduplicar. */
  purchasePixel: objectType({
    eventId: stringType(),
    valueCents: numberType().int(),
    currency: stringType(),
    metaPixelId: stringType().nullable(),
    tiktokPixelId: stringType().nullable(),
    eventName: stringType()
  }).nullable()
});
objectType({
  lat: numberType().min(-90).max(90),
  lng: numberType().min(-180).max(180)
});
objectType({
  formatted: stringType().nullable(),
  country: stringType().nullable(),
  province: stringType().nullable(),
  provinceCode: stringType().nullable(),
  city: stringType().nullable(),
  district: stringType().nullable(),
  street: stringType().nullable(),
  number: stringType().nullable(),
  postalCode: stringType().nullable(),
  confidence: numberType().min(0).max(1)
});
const subtotal = {
  name: "subtotal",
  apply(d, ctx) {
    d.subtotalCents = ctx.unitPriceCents * ctx.qty;
  }
};
function offerDiscount(qty, unitPriceCents, offers) {
  const subtotal2 = unitPriceCents * qty;
  const match = offers.filter((o) => qty >= o.minQty).sort((a, b) => b.minQty - a.minQty)[0];
  if (!match) return { discountCents: 0, freeShipping: false, label: null };
  let discount = 0;
  if (match.bundlePriceCents != null && unitPriceCents > 0) {
    const full = unitPriceCents * match.minQty;
    const rate = full > 0 ? Math.max(0, 1 - match.bundlePriceCents / full) : 0;
    discount = Math.round(subtotal2 * rate);
  } else if (match.discountCents > 0) {
    discount = Math.min(match.discountCents, subtotal2);
  } else if (match.discountBps > 0) {
    discount = Math.round(subtotal2 * match.discountBps / 1e4);
  }
  if (discount <= 0 && !match.freeShipping) return { discountCents: 0, freeShipping: false, label: null };
  return { discountCents: discount, freeShipping: match.freeShipping, label: match.label };
}
const quantityOffers = {
  name: "quantity-offers",
  apply(d, ctx) {
    var _a2, _b, _c;
    const r = offerDiscount(ctx.qty, ctx.unitPriceCents, ctx.offers);
    const x = ctx.lineOffers;
    d.discountCents += r.discountCents + ((_a2 = x == null ? void 0 : x.discountCents) != null ? _a2 : 0);
    if (r.freeShipping || (x == null ? void 0 : x.freeShipping)) d.freeShipping = true;
    d.appliedOffer = (_c = (_b = r.label) != null ? _b : x == null ? void 0 : x.label) != null ? _c : null;
  }
};
const discounts = {
  name: "discounts",
  apply(d, ctx) {
    const x = ctx.discount;
    if (!x) return;
    const base = ctx.discountBaseCents != null ? Math.min(ctx.discountBaseCents, d.subtotalCents) : d.subtotalCents;
    if (x.kind === "PERCENTAGE" && x.valueBps) {
      d.discountCents += Math.round(base * x.valueBps / 1e4);
    } else if (x.kind === "FIXED" && x.valueCents) {
      d.discountCents += Math.min(x.valueCents, base);
    } else if (x.kind === "FREE_SHIPPING") {
      d.freeShipping = true;
    }
    d.discountCents = Math.min(d.discountCents, d.subtotalCents);
  }
};
const shipping = {
  name: "shipping",
  apply(d, ctx) {
    var _a2;
    const goods = d.subtotalCents - d.discountCents + d.addonsCents;
    const free = d.freeShipping || ctx.freeShippingOverCents !== null && goods >= ctx.freeShippingOverCents;
    const base = (_a2 = ctx.provinceShippingCents) != null ? _a2 : ctx.defaultShippingCents;
    d.shippingCents = free ? 0 : base;
  }
};
const addons = {
  name: "addons",
  apply(d, ctx) {
    var _a2;
    d.addonsCents = (_a2 = ctx.addonsCents) != null ? _a2 : 0;
  }
};
const codFee = {
  name: "cod-fee",
  apply(d, ctx) {
    var _a2;
    d.codFeeCents = (_a2 = ctx.codFeeCents) != null ? _a2 : 0;
  }
};
const PIPELINE = [subtotal, quantityOffers, discounts, addons, shipping, codFee];
function quote(ctx) {
  const d = {
    subtotalCents: 0,
    discountCents: 0,
    shippingCents: 0,
    addonsCents: 0,
    codFeeCents: 0,
    freeShipping: false,
    appliedOffer: null
  };
  for (const step of PIPELINE) step.apply(d, ctx);
  return {
    subtotalCents: d.subtotalCents,
    discountCents: d.discountCents,
    shippingCents: d.shippingCents,
    addonsCents: d.addonsCents,
    codFeeCents: d.codFeeCents,
    totalCents: d.subtotalCents - d.discountCents + d.addonsCents + d.shippingCents + d.codFeeCents,
    currency: ctx.currency,
    appliedOffer: d.appliedOffer,
    appliedDiscount: ctx.discount ? { code: ctx.discount.code, source: ctx.discount.source, label: ctx.discount.label } : null
  };
}
const money = (cents, currency = "DOP") => {
  const frac = Math.round(cents) % 100 !== 0 ? 2 : 0;
  return `${currency === "DOP" ? "RD$" : currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: 2 })}`;
};
function marchSvg(cls, rx = 12) {
  return `<svg class="${cls}-march" aria-hidden="true" focusable="false"><rect x="0" y="0" width="100%" height="100%" rx="${rx}" ry="${rx}"/></svg>`;
}
function cardAnimationCss(cls, done = ".cod-bump-on,.cod-upsell-on") {
  const a = (n) => `.${cls}.${cls}-anim-${n}`;
  const k = (n) => `${cls}-k-${n}`;
  const d = (s) => `calc(${s}s * var(--anim-speed, 1))`;
  const doneSel = done.split(",").map((s) => `${s.trim()}.${cls}`).join(",");
  return `
.${cls}[class*="${cls}-anim-"]:not(.${cls}-anim-none):not(.${cls}-anim-march){will-change:transform}
${a("march")}{border-color:transparent!important}
.${cls}-march{position:absolute;inset:-1px;width:calc(100% + 2px);height:calc(100% + 2px);overflow:visible;pointer-events:none}
.${cls}-march rect{fill:none;stroke:var(--card-color,#1f2a44);stroke-width:2;stroke-dasharray:7 5;
  animation:${k("march")} ${d(0.9)} linear infinite}
@keyframes ${k("march")}{to{stroke-dashoffset:-24}}

/* Recorta el brillo a los lados y abajo, pero deja pasar la cinta de arriba. */
${a("shine")}{clip-path:inset(-40px 0 0 0 round 0 0 12px 12px)}
${a("shine")}::before{content:'';position:absolute;top:0;bottom:0;left:0;width:60%;pointer-events:none;z-index:1;
  background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.78) 50%,transparent 80%);
  transform:translate3d(-110%,0,0);animation:${k("shine")} ${d(3.2)} ease-in-out infinite}
@keyframes ${k("shine")}{0%{transform:translate3d(-110%,0,0)}45%,100%{transform:translate3d(280%,0,0)}}

${a("pulse")}{animation:${k("pulse")} ${d(2.2)} ease-in-out infinite}
@keyframes ${k("pulse")}{0%,60%,100%{transform:scale(1)}20%{transform:scale(1.025)}40%{transform:scale(.995)}}

${a("glow")}::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:0 0 0 5px color-mix(in srgb,var(--card-color,#1f2a44) 22%,transparent),0 6px 18px -6px color-mix(in srgb,var(--card-color,#1f2a44) 45%,transparent);
  opacity:0;animation:${k("glow")} ${d(2.4)} ease-in-out infinite}
@keyframes ${k("glow")}{0%,100%{opacity:0}50%{opacity:1}}

${a("shake")}{animation:${k("shake")} ${d(3.4)} ease-in-out infinite}
@keyframes ${k("shake")}{0%,70%,100%{transform:translate3d(0,0,0) rotate(0)}73%{transform:translate3d(-3px,0,0) rotate(-.6deg)}
  76%{transform:translate3d(3px,0,0) rotate(.6deg)}79%{transform:translate3d(-2px,0,0) rotate(-.4deg)}82%{transform:translate3d(2px,0,0) rotate(.3deg)}85%{transform:translate3d(0,0,0)}}

${doneSel}{animation:none;clip-path:none}
${done.split(",").map((s) => `${s.trim()}.${cls}::before,${s.trim()}.${cls}::after`).join(",")}{animation:none;opacity:0}
${done.split(",").map((s) => `${s.trim()} .${cls}-march rect`).join(",")}{animation:none}
@media (prefers-reduced-motion:reduce){.${cls},.${cls}::before,.${cls}::after,.${cls}-march rect{animation:none!important}}
`;
}
function renderOffers(host, config, state, onChange) {
  var _a2, _b, _c;
  const list = [...config.offers].filter((o) => provinceAllows(o.provinces, state.province())).sort((a, b) => a.minQty - b.minQty);
  if (!list.some((o) => o.minQty > 1)) {
    if (state.qty > 1 && !state.qtyFromPage) state.qty = 1;
    return;
  }
  if (state.pageManagesQty || config.tokens.offerCard.showInForm === false) return;
  const unit = state.unitPriceCents;
  const cur = config.settings.currency;
  const style = config.tokens.offerCard;
  const base = (_a2 = list.find((o) => o.minQty === 1)) != null ? _a2 : {
    id: "base",
    type: "QUANTITY",
    minQty: 1,
    discountBps: 0,
    freeShipping: false,
    label: "1 unidad",
    title: "",
    subtitle: "",
    badge: "",
    bundlePriceCents: null,
    discountCents: 0,
    productIds: [],
    preselected: false,
    provinces: { mode: "all", codes: [] },
    style: { border: "solid", borderColor: "", bg: "", animation: "none", animationSpeed: "normal", badgeColor: "", badgeSide: "right", badgeTimer: 0 }
  };
  const cards = [base, ...list.filter((o) => o.minQty > 1)];
  if (!state.qtyFromPage && !cards.some((o) => o.minQty === state.qty)) {
    state.qty = (_c = (_b = cards.find((o) => o.preselected)) == null ? void 0 : _b.minQty) != null ? _c : 1;
  }
  const pre = cards.find((o) => o.preselected);
  if (pre && state.qty === 1 && !state.qtyFromPage && !state.preselectDone) state.qty = pre.minQty;
  state.preselectDone = true;
  const wrap = document.createElement("div");
  wrap.className = "cod-offers";
  wrap.setAttribute("role", "radiogroup");
  wrap.setAttribute("aria-label", "Cantidad");
  wrap.innerHTML = cards.map((o) => {
    const full = unit * o.minQty;
    const price = o.bundlePriceCents != null ? o.bundlePriceCents : o.discountCents > 0 ? Math.max(0, full - o.discountCents) : Math.round(full * (1 - o.discountBps / 1e4));
    const save = full > 0 && price < full ? Math.round((1 - price / full) * 100) : 0;
    const title = o.title || (o.minQty === 1 ? "1 unidad" : `${o.minQty} unidades`);
    const st = o.style;
    const anim = (st == null ? void 0 : st.animation) && st.animation !== "none" ? ` cod-card cod-card-anim-${st.animation}` : "";
    const ribbon = !!(o.badge || (st == null ? void 0 : st.badgeTimer));
    return `
    <button type="button" class="cod-offer${ribbon ? " cod-offer-has-badge" : ""}${anim}" role="radio"
      aria-checked="${o.minQty === state.qty}" data-qty="${o.minQty}" data-offer="${esc$1(o.id)}" style="${cardVars(o)}">
      ${(st == null ? void 0 : st.animation) === "march" ? marchSvg("cod-card") : ""}
      ${ribbon ? `<span class="cod-offer-ribbon${(st == null ? void 0 : st.badgeSide) === "left" ? " cod-offer-ribbon-left" : ""}"${(st == null ? void 0 : st.badgeColor) ? ` style="background:${cssColor(st.badgeColor)}"` : ""}>${o.badge ? `<span>${esc$1(o.badge)}</span>` : ""}${(st == null ? void 0 : st.badgeTimer) ? `<span class="cod-offer-clock">${o.badge ? "" : "Termina en "}<b data-timer="${st.badgeTimer}" data-key="${esc$1(o.id)}"></b></span>` : ""}</span>` : ""}
      <span class="cod-offer-dot"></span>
      <span class="cod-offer-text">
        <b>${esc$1(title)}</b>
        ${o.subtitle ? `<small>${esc$1(o.subtitle)}</small>` : ""}
        ${style.showSave && save > 0 ? `<span class="cod-offer-save">Ahorras ${save}%</span>` : ""}
        ${o.freeShipping ? '<span class="cod-offer-save">Envío gratis</span>' : ""}
      </span>
      ${unit > 0 ? `<span class="cod-offer-price">
        <b>${money(price, cur)}</b>
        ${style.showCompare && save > 0 ? `<s>${money(full, cur)}</s>` : ""}
      </span>` : ""}
    </button>`;
  }).join("");
  wrap.querySelectorAll(".cod-offer").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.qty = Number(btn.dataset.qty) || 1;
      wrap.querySelectorAll(".cod-offer").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
      onChange();
    });
  });
  host.appendChild(wrap);
  wrap.querySelectorAll(".cod-card-anim-march").forEach((el) => requestAnimationFrame(() => {
    var _a3, _b2;
    const r = Math.max(0, (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12) - 1);
    (_a3 = el.querySelector(".cod-card-march rect")) == null ? void 0 : _a3.setAttribute("rx", String(r));
    (_b2 = el.querySelector(".cod-card-march rect")) == null ? void 0 : _b2.setAttribute("ry", String(r));
  }));
  wrap.querySelectorAll("[data-timer]").forEach((b) => countdown(b, Number(b.dataset.timer) || 0, `cod-offer-${b.dataset.key}`));
}
function cssColor(v) {
  const c = v.trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(c) ? c : "";
}
function cardVars(o) {
  var _a2;
  const st = o.style;
  if (!st) return "";
  const out = [];
  const border = cssColor(st.borderColor);
  const bg = cssColor(st.bg);
  if (st.border === "none") out.push("--offer-border:transparent");
  else {
    if (border) out.push(`--offer-border:${border}`);
    if (st.border === "dashed") out.push("--offer-border-style:dashed");
  }
  if (bg) out.push(`--offer-bg:${bg}`);
  out.push(`--card-color:${border || "var(--cod-offer-accent)"}`);
  out.push(`--anim-speed:${ANIMATION_SPEEDS[(_a2 = st.animationSpeed) != null ? _a2 : "normal"]}`);
  return out.join(";");
}
function countdown(out, mins, key) {
  if (!mins) return;
  const total = mins * 60;
  let start = Date.now();
  try {
    const v = Number(localStorage.getItem(key));
    if (v > 0 && v <= Date.now()) start = v;
    else localStorage.setItem(key, String(start));
  } catch {
  }
  const p = (n) => String(n).padStart(2, "0");
  const tick = () => {
    let left = total - Math.floor((Date.now() - start) / 1e3);
    if (left <= 0) {
      start = Date.now();
      try {
        localStorage.setItem(key, String(start));
      } catch {
      }
      left = total;
    }
    const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
    out.textContent = h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };
  tick();
  const t = window.setInterval(() => {
    if (!out.isConnected) {
      window.clearInterval(t);
      return;
    }
    tick();
  }, 1e3);
}
const esc$1 = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function lookOf(f) {
  var _a2;
  const l = (_a2 = f.look) != null ? _a2 : { icon: "", color: "", align: "left", size: "md" };
  const color = /^#[0-9a-f]{3,8}$/i.test(l.color) ? l.color : "";
  return {
    icon: l.icon ? `<span class="cod-tico">${buttonIconSvg(l.icon, "cod-tico-svg")}</span>` : "",
    style: [color ? `color:${color}` : "", l.align && l.align !== "left" ? `text-align:${l.align};justify-content:${l.align === "center" ? "center" : "flex-end"}` : ""].filter(Boolean).join(";"),
    cls: l.size && l.size !== "md" ? ` cod-t-${l.size}` : ""
  };
}
function renderForm(root, config, state, handlers) {
  root.innerHTML = `
    <form class="cod-form" novalidate>
      ${config.tokens.progressBar ? '<div class="cod-progress"><span></span></div>' : ""}
      <div class="cod-offers-slot"></div>
      <div class="cod-fields"></div>
      <div class="cod-addons-slot"></div>
      <div class="cod-form-error" role="alert"></div>
      <button type="submit" class="cod-submit cod-submit-anim-${config.tokens.submit.animation}${config.tokens.submit.depth ? " cod-depth" : ""}">
        <span class="cod-submit-label">${esc(config.tokens.submit.text)}</span>
        <span class="cod-submit-price" hidden></span>
        ${config.tokens.submit.iconType === "svg" && config.tokens.submit.iconName ? `<span class="cod-submit-icon cod-ico">${buttonIconSvg(config.tokens.submit.iconName, "cod-ico-svg")}</span>` : config.tokens.submit.iconType === "emoji" ? `<span class="cod-submit-icon">${esc(config.tokens.submit.icon)}</span>` : ""}
        <span class="cod-spinner" aria-hidden="true"></span>
      </button>
    </form>`;
  const form = root.querySelector(".cod-form");
  const box = root.querySelector(".cod-fields");
  const offersSlot = root.querySelector(".cod-offers-slot");
  state.shownKey = shownKeyOf(state);
  renderOffers(offersSlot, config, state, () => update(root, state));
  state.onVariantChange(() => {
    offersSlot.innerHTML = "";
    renderOffers(offersSlot, config, state, () => update(root, state));
  });
  const fields = [...config.fields].sort((a, b) => a.order - b.order);
  for (const f of fields) box.appendChild(renderField(f, config, state, () => update(root, state)));
  if (config.addons.length) {
    void import("./addons-D4nrFYRq.js").then(({ renderAddons }) => {
      renderAddons(root.querySelector(".cod-addons-slot"), config, state, () => update(root, state));
    });
  }
  form.addEventListener("submit", (e) => {
    var _a2;
    e.preventDefault();
    const errors = state.validate();
    if (Object.keys(errors).length) {
      for (const [key, msg] of Object.entries(errors)) showError(root, key, msg);
      (_a2 = root.querySelector(".cod-invalid")) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    handlers.onSubmit();
  });
  state.onQuote(() => paintPrice(root, state));
  state.onQtyChange((q) => {
    root.querySelectorAll(".cod-offer").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.qty) === q)));
    update(root, state);
  });
  update(root, state);
}
function paintPrice(root, state) {
  const el = root.querySelector(".cod-submit-price");
  const mode = state.config.tokens.submit.priceDisplay;
  const q = state.quote;
  if (!el) return;
  if (!q || !mode || mode === "none") {
    el.hidden = true;
    return;
  }
  const cents = mode === "total" ? q.totalCents : q.subtotalCents - q.discountCents + q.addonsCents;
  el.textContent = `· ${money(cents, q.currency)}`;
  el.hidden = false;
}
function renderDiscount(f, config, state, onChange, wrap) {
  const id = `cod-${f.key}`;
  const req = f.required ? '<span class="cod-req">*</span>' : '<span class="cod-opt">Opcional</span>';
  wrap.innerHTML = `
    ${f.label ? `<label for="${id}">${esc(f.label)} ${req}</label>` : ""}
    <div class="cod-discount">
      <input type="text" id="${id}" autocomplete="off" autocapitalize="characters" spellcheck="false"
        placeholder="${esc(f.placeholder || "Escribe tu código")}">
      <button type="button" class="cod-discount-btn${config.tokens.applyDepth ? " cod-depth" : ""}">${esc(f.content || "Aplicar")}</button>
    </div>
    <span class="cod-discount-ok" hidden></span>
    ${f.help ? `<span class="cod-help">${esc(f.help)}</span>` : ""}
    <span class="cod-err"></span>`;
  const input = wrap.querySelector("input");
  const btn = wrap.querySelector(".cod-discount-btn");
  const okEl = wrap.querySelector(".cod-discount-ok");
  const label = f.content || "Aplicar";
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
      await state.applyDiscount(null).catch(() => void 0);
      onChange();
      return;
    }
    const code = input.value.trim();
    if (!code) {
      setError(wrap, "Escribe un código.");
      return;
    }
    btn.disabled = true;
    btn.classList.add("cod-loading");
    try {
      const q = await state.applyDiscount(code);
      if (!q.appliedDiscount) {
        setError(wrap, "Este código no es válido o ya caducó.");
      } else {
        applied = true;
        input.disabled = true;
        btn.textContent = "Quitar";
        state.values[f.key] = q.appliedDiscount.code;
        okEl.textContent = q.discountCents > 0 ? `Código ${q.appliedDiscount.code} aplicado: ahorras ${money(q.discountCents, q.currency)}` : `Código ${q.appliedDiscount.code} aplicado`;
        okEl.hidden = false;
      }
    } catch {
      setError(wrap, "No pudimos comprobar el código. Inténtalo de nuevo.");
    } finally {
      btn.disabled = false;
      btn.classList.remove("cod-loading");
      onChange();
    }
  };
  btn.addEventListener("click", () => void apply());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void apply();
    }
  });
  input.addEventListener("input", () => clearError(wrap));
  return wrap;
}
function renderField(f, config, state, onChange) {
  var _a2;
  const wrap = document.createElement("div");
  wrap.className = `cod-field cod-w${f.width}`;
  wrap.dataset.key = f.key;
  const lk = lookOf(f);
  if (f.type === "heading") {
    wrap.innerHTML = `<h3 class="cod-heading${lk.cls}" style="${lk.style}">${lk.icon}<span>${esc(f.content)}</span></h3>`;
    return wrap;
  }
  if (f.type === "subheading") {
    wrap.innerHTML = `<p class="cod-subheading${lk.cls}" style="${lk.style}">${lk.icon}<span>${esc(f.content)}</span></p>`;
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
    wrap.innerHTML = f.content ? `<img class="cod-img" src="${esc(f.content)}" alt="" loading="lazy">` : "";
    return wrap;
  }
  if (f.type === "richtext") {
    wrap.innerHTML = `<p class="cod-richtext${lk.cls}" style="${lk.style}">${lk.icon}<span>${esc(f.content).replace(/\n/g, "<br>")}</span></p>`;
    return wrap;
  }
  if (f.type === "video") {
    wrap.innerHTML = videoEmbed(f.content);
    return wrap;
  }
  if (f.type === "file" || f.type === "map") {
    wrap.className += " cod-hidden";
    return wrap;
  }
  if (f.type === "discount") return renderDiscount(f, config, state, onChange, wrap);
  if (f.type === "location") {
    mountLocation(wrap, config, state, onChange);
    return wrap;
  }
  const id = `cod-${f.key}`;
  const req = f.required ? '<span class="cod-req">*</span>' : '<span class="cod-opt">Opcional</span>';
  const label = f.label ? `<label for="${id}" class="cod-flabel" style="${lk.style}">${lk.icon}<span>${esc(f.label)}</span> ${req}</label>` : "";
  const help = f.help ? `<span class="cod-help">${esc(f.help)}</span>` : "";
  const maxLen = ((_a2 = f.validation) == null ? void 0 : _a2.maxLength) != null ? ` maxlength="${Number(f.validation.maxLength)}"` : "";
  let control;
  switch (f.type) {
    case "textarea":
      control = `<textarea id="${id}" rows="2"${maxLen} placeholder="${esc(f.placeholder)}"></textarea>`;
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
    case "radio":
      control = `<div class="cod-choices" role="radiogroup">${f.options.map((o, i) => `
        <label class="cod-choice"><input type="radio" name="${id}" value="${esc(o.value)}" ${i === 0 ? `id="${id}"` : ""}>
        <span class="cod-choice-dot"></span><span>${esc(o.label)}</span></label>`).join("")}</div>`;
      break;
    case "multiselect":
      control = `<div class="cod-choices">${f.options.map((o, i) => `
        <label class="cod-choice"><input type="checkbox" value="${esc(o.value)}" ${i === 0 ? `id="${id}"` : ""}>
        <span class="cod-check-box"></span><span>${esc(o.label)}</span></label>`).join("")}</div>`;
      break;
    case "phone":
      control = `<div class="cod-phone"><span>+1</span>
        <input type="tel" id="${id}" inputmode="tel" placeholder="${esc(f.placeholder)}"></div>`;
      break;
    default: {
      const type = f.type === "email" ? "email" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text";
      control = `<input type="${type}" id="${id}"${maxLen}
        placeholder="${esc(f.placeholder)}" ${f.type === "number" ? 'inputmode="numeric"' : ""}>`;
    }
  }
  wrap.innerHTML = `${f.type === "checkbox" ? "" : label}${control}${help}<span class="cod-err"></span>`;
  if (f.type === "radio" || f.type === "multiselect") {
    const boxes = [...wrap.querySelectorAll(".cod-choices input")];
    boxes.forEach((b) => b.addEventListener("change", () => {
      state.values[f.key] = boxes.filter((x) => x.checked).map((x) => x.value).join(", ");
      clearError(wrap);
      onChange();
    }));
    return wrap;
  }
  const input = wrap.querySelector("input, select, textarea");
  const event = f.type === "select" || f.type === "checkbox" ? "change" : "input";
  input.addEventListener(event, () => {
    if (f.type === "checkbox") {
      state.values[f.key] = input.checked ? "true" : "";
    } else if (f.type === "phone") {
      let d = input.value.replace(/\D/g, "");
      if (d.startsWith("1") && (d.length > 10 || /^1(809|829|849)/.test(d))) d = d.slice(1);
      d = d.slice(0, 10);
      input.value = d.length > 6 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
      state.values[f.key] = input.value;
    } else {
      state.values[f.key] = input.value;
    }
    clearError(wrap);
    onChange();
  });
  input.addEventListener("blur", () => {
    var _a3;
    const err = validateField(f, (_a3 = state.values[f.key]) != null ? _a3 : "");
    if (err) setError(wrap, err);
  });
  return wrap;
}
const pending = /* @__PURE__ */ new WeakMap();
function update(root, state) {
  if (pending.get(root)) return;
  pending.set(root, requestAnimationFrame(() => {
    var _a2;
    pending.delete(root);
    const key = shownKeyOf(state);
    if (key !== state.shownKey) {
      state.shownKey = key;
      repaintOffers(root, state);
    }
    const visible = new Set(state.visibleFields().map((f) => f.key));
    root.querySelectorAll(".cod-field").forEach((el) => {
      const key2 = el.dataset.key;
      const show = visible.has(key2) || !state.config.fields.some((f) => f.key === key2);
      el.classList.toggle("cod-hidden", !show);
    });
    if (state.config.tokens.submit.priceDisplay !== "none") state.requestQuote();
    paintPrice(root, state);
    const bar = root.querySelector(".cod-progress span");
    if (bar) {
      const required = state.visibleFields().filter((f) => f.required);
      const done = required.filter((f) => {
        var _a3;
        return !validateField(f, (_a3 = state.values[f.key]) != null ? _a3 : "");
      }).length;
      const pct = required.length ? done / required.length * 100 : 0;
      bar.style.width = `${pct}%`;
      (_a2 = root.querySelector(".cod-submit")) == null ? void 0 : _a2.classList.toggle("cod-ready", pct === 100);
    }
  }));
}
function shownKeyOf(state) {
  const p = state.province();
  return [...state.config.offers, ...state.config.addons].filter((x) => provinceAllows(x.provinces, p)).map((x) => x.id).join(",");
}
function repaintOffers(root, state) {
  const config = state.config;
  const allowed = new Set(config.addons.filter((a) => provinceAllows(a.provinces, state.province())).map((a) => a.id));
  state.acceptedAddons = state.acceptedAddons.filter((a) => allowed.has(a.id));
  const offersSlot = root.querySelector(".cod-offers-slot");
  if (offersSlot) {
    offersSlot.innerHTML = "";
    renderOffers(offersSlot, config, state, () => update(root, state));
  }
  const addonsSlot = root.querySelector(".cod-addons-slot");
  if (addonsSlot && config.addons.length) {
    void import("./addons-D4nrFYRq.js").then(({ renderAddons }) => {
      addonsSlot.innerHTML = "";
      renderAddons(addonsSlot, config, state, () => update(root, state));
    });
  }
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
function videoEmbed(url2) {
  const u = (url2 || "").trim();
  if (!u) return "";
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(u);
  if (yt) return `<div class="cod-video"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  const vm = /vimeo\.com\/(\d+)/.exec(u);
  if (vm) return `<div class="cod-video"><iframe src="https://player.vimeo.com/video/${vm[1]}" allowfullscreen loading="lazy"></iframe></div>`;
  return `<div class="cod-video"><video src="${esc(u)}" controls playsinline preload="metadata"></video></div>`;
}
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CSS = `
*,*::before,*::after{box-sizing:border-box}
.cod-root{font-family:var(--cod-font);font-size:var(--cod-size);color:var(--cod-text);
  background:var(--cod-surface);border-radius:var(--cod-radius);box-shadow:var(--cod-shadow);
  padding:18px;-webkit-tap-highlight-color:transparent}
/* Modo botón: solo el botón «Comprar ahora», sin la tarjeta del formulario alrededor. */
.cod-root.cod-root-trigger{background:none;box-shadow:none;padding:4px 0;display:flex;justify-content:center}
.cod-root-trigger .cod-trigger[style*="width:100%"]{width:100%}

.cod-skeleton{display:grid;gap:10px}
.cod-skeleton span{height:42px;border-radius:var(--cod-radius);
  background:linear-gradient(100deg,#eee 30%,#f7f7f7 50%,#eee 70%);background-size:220% 100%;
  animation:cod-shim 1.1s linear infinite}
@keyframes cod-shim{from{background-position:120% 0}to{background-position:-120% 0}}

.cod-progress{height:4px;background:#f0f0f0;border-radius:99px;overflow:hidden;margin-bottom:14px}
.cod-progress span{display:block;height:100%;width:0;border-radius:99px;background:var(--cod-progress);
  transition:width .6s var(--cod-ease)}

.cod-fields{display:grid;grid-template-columns:repeat(12,1fr);gap:var(--cod-gap)}
.cod-field{grid-column:span 12;animation:cod-in .22s var(--cod-ease) both}
/* En la ventana ya entra todo junto: los campos no se animan uno a uno (más fluido en el móvil). */
.cod-modal .cod-field{animation:none}
/* Mientras el cliente escribe, las animaciones que se repiten se detienen: el teclado y el
   desplazamiento van fluidos. Vuelven al salir del campo. */
.cod-form:focus-within .cod-submit,.cod-form:focus-within .cod-submit::before,.cod-form:focus-within .cod-submit::after,
.cod-form:focus-within .cod-seg-btn::after{animation-play-state:paused!important}
/* Con la ventana abierta, el botón de la página (que queda detrás) no se anima. */
:host([data-cod-paused]) .cod-trigger,:host([data-cod-paused]) .cod-trigger::before,:host([data-cod-paused]) .cod-trigger::after{animation-play-state:paused!important}
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
/* iPhone hace zoom (y no lo quita) en campos con letra < 16 px: nunca menos de 16 px. */
input:not([type=checkbox]):not([type=radio]),select,textarea{font-size:max(16px,1em)!important}
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
.cod-phone span{white-space:nowrap;flex:none;padding:10px 10px 10px 12px;color:var(--cod-muted);border-right:1.5px solid var(--cod-border)}
.cod-phone input{border:none!important;background:transparent!important;box-shadow:none!important}

/* ".cod-field label" e ".cod-field input" son más específicos: hay que ganarles. */
.cod-field .cod-check{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:12.5px;
  font-weight:500;margin:0;position:relative}
.cod-field .cod-check input{position:absolute;opacity:0;width:1px;height:1px;padding:0;border:0;margin:0}
.cod-check input:focus-visible+.cod-check-box{box-shadow:0 0 0 3.5px rgba(0,0,0,.12)}
.cod-invalid .cod-check-box{border-color:var(--cod-danger)}
.cod-check-box{width:20px;height:20px;border:2px solid var(--cod-border);border-radius:6px;
  background:var(--cod-field);flex-shrink:0;position:relative;
  transition:background .22s var(--cod-ease),border-color .22s var(--cod-ease),transform .28s cubic-bezier(.34,1.42,.64,1)}
.cod-check input:checked+.cod-check-box{background:var(--cod-ok);border-color:var(--cod-ok);transform:scale(1.08)}
.cod-check input:checked+.cod-check-box::after{content:'';position:absolute;left:6px;top:2px;width:5px;height:10px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(45deg)}

.cod-heading{margin:2px 0 0;font-size:1.25em;font-weight:700;line-height:1.25;color:var(--cod-text)}
.cod-heading,.cod-subheading,.cod-richtext{display:flex;align-items:center;gap:.45em}
.cod-flabel{display:flex;align-items:center;gap:.35em}
.cod-flabel .cod-opt{margin-left:auto;float:none}
.cod-tico{display:inline-flex;flex:none}.cod-tico-svg{width:1.15em;height:1.15em;display:block}
.cod-heading.cod-t-sm{font-size:1.05em}.cod-heading.cod-t-lg{font-size:1.6em}
.cod-subheading.cod-t-sm{font-size:.88em}.cod-subheading.cod-t-lg{font-size:1.18em}
.cod-richtext.cod-t-sm{font-size:12px}.cod-richtext.cod-t-lg{font-size:15px}
.cod-subheading{margin:0;font-size:1em;font-weight:600;color:var(--cod-muted)}
.cod-divider{border:0;border-top:1px solid var(--cod-border);margin:4px 0}
.cod-img{display:block;max-width:100%;height:auto;border-radius:var(--cod-radius)}
.cod-submit-price{font-weight:600;opacity:.92;white-space:nowrap;margin-left:-3px}
.cod-discount{display:flex;gap:8px}
.cod-discount input{flex:1;min-width:0;text-transform:uppercase}
.cod-discount input:disabled{opacity:.7}
.cod-depth{box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -1px 0 rgba(0,0,0,.10);transition:transform .12s ease,filter .15s ease}
.cod-depth:active{transform:translateY(1px) scale(.99)!important}
.cod-discount-btn.cod-depth{background-image:linear-gradient(180deg,rgba(255,255,255,.26),rgba(255,255,255,.06) 48%,rgba(0,0,0,.12));
  box-shadow:0 6px 12px -5px color-mix(in srgb,var(--cod-apply-bg,#111) 60%,transparent),inset 0 1px 0 rgba(255,255,255,.28)}
.cod-discount-btn{flex-shrink:0;padding:0 16px;border:0;border-radius:var(--cod-radius);background:var(--cod-apply-bg,var(--cod-text));
  color:var(--cod-apply-color,var(--cod-surface));font:inherit;font-weight:600;font-size:13px;cursor:pointer}
.cod-discount-btn:disabled{opacity:.6;cursor:default}
.cod-discount-ok{display:block;margin-top:5px;font-size:12px;font-weight:600;color:var(--cod-ok)}
.cod-choices{display:grid;gap:7px}
.cod-field .cod-choice{display:flex;align-items:center;gap:9px;margin:0;padding:10px 12px;cursor:pointer;
  font-size:13px;font-weight:500;border:1.5px solid var(--cod-border);border-radius:var(--cod-radius);background:var(--cod-field)}
.cod-field .cod-choice input{position:absolute;opacity:0;width:1px;height:1px;padding:0;border:0;margin:0}
.cod-choice:has(input:checked){border-color:var(--cod-brand);background:#fff}
.cod-choice-dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--cod-border);flex-shrink:0;position:relative}
.cod-choice input:checked+.cod-choice-dot{border-color:var(--cod-brand)}
.cod-choice input:checked+.cod-choice-dot::after{content:'';position:absolute;inset:3px;border-radius:50%;background:var(--cod-brand)}
.cod-choice input:checked+.cod-check-box{background:var(--cod-ok);border-color:var(--cod-ok)}
.cod-choice input:checked+.cod-check-box::after{content:'';position:absolute;left:6px;top:2px;width:5px;height:10px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(45deg)}
.cod-richtext{margin:0;font-size:13px;line-height:1.55;color:var(--cod-text)}
.cod-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--cod-radius);overflow:hidden;background:#000}
.cod-video iframe,.cod-video video{position:absolute;inset:0;width:100%;height:100%;border:0}

/* ── Ubicación ── */
.cod-seg{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cod-glider{display:none}
/* Cada opción es un botón de verdad: fondo, borde, sombra, icono y se hunde al tocarlo. */
.cod-seg-btn{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:11px 6px 10px;border:1.5px solid var(--cod-border);border-radius:var(--cod-radius);
  background:linear-gradient(180deg,var(--cod-surface),color-mix(in srgb,var(--cod-surface) 94%,#8a94a6));color:var(--cod-text);cursor:pointer;font:inherit;
  box-shadow:0 1px 1px rgba(0,0,0,.04),0 3px 8px -3px rgba(0,0,0,.16),inset 0 1px 0 #fff;
  transition:border-color .2s var(--cod-ease),box-shadow .2s var(--cod-ease),transform .12s}
.cod-seg-btn:hover{box-shadow:0 1px 1px rgba(0,0,0,.05),0 6px 14px -5px rgba(0,0,0,.22),inset 0 1px 0 #fff}
.cod-seg-btn:active{transform:translateY(1px) scale(.98);box-shadow:0 1px 2px rgba(0,0,0,.1)}
.cod-seg-btn[aria-checked="true"]{border-color:var(--cod-brand);border-width:2px;padding:10.5px 5.5px 9.5px;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--cod-brand) 14%,transparent),0 3px 8px -3px rgba(0,0,0,.16)}
.cod-seg-ico{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;margin-bottom:2px;
  background:color-mix(in srgb,var(--cod-brand) 10%,var(--cod-surface));color:var(--cod-brand)}
.cod-seg-ico::before{content:'';width:19px;height:19px;background:currentColor;-webkit-mask:var(--ico) no-repeat center/contain;mask:var(--ico) no-repeat center/contain}
.cod-seg-btn[data-mode="gps"] .cod-seg-ico{--ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 21s-7-6.2-7-11.5a7 7 0 1114 0C19 14.8 12 21 12 21z'/%3E%3Ccircle cx='12' cy='9.5' r='2.6'/%3E%3C/svg%3E")}
.cod-seg-btn[data-mode="manual"] .cod-seg-ico{--ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z'/%3E%3Cpath d='M13.5 6.5l4 4'/%3E%3C/svg%3E")}
.cod-locating .cod-seg-ico::before{display:none}
.cod-seg-tag{position:absolute;top:-9px;left:50%;transform:translateX(-50%);white-space:nowrap;z-index:2;
  padding:2px 8px;border-radius:99px;background:#16a34a;color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.02em;
  box-shadow:0 2px 6px -2px rgba(22,163,74,.6)}
.cod-seg{margin-top:12px}
.cod-seg-btn b{font-size:12.5px;font-weight:700}.cod-seg-btn small{font-size:10.5px;color:var(--cod-muted)}
/* Mientras no elige nada, la opción del mapa «llama» suavemente para que se note que se toca. */
.cod-seg-btn[data-mode="gps"]::after{content:'';position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;
  border:2px solid var(--cod-brand);opacity:0}
.cod-seg:not([data-active]) .cod-seg-btn[data-mode="gps"]::after{animation:cod-tapme 2.4s ease-out infinite}
@keyframes cod-tapme{0%{transform:scale(1);opacity:.45}55%,100%{transform:scale(1.06,1.12);opacity:0}}
@media (prefers-reduced-motion:reduce){.cod-seg:not([data-active]) .cod-seg-btn[data-mode="gps"]::after{animation:none}}
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
.cod-map-zoom{position:absolute;right:7px;top:7px;display:none;flex-direction:column;gap:5px;z-index:3}
.cod-map-editing .cod-map-zoom{display:flex}
.cod-map-zoom button{width:34px;height:34px;border:1.5px solid var(--cod-border);border-radius:9px;background:#fff;color:#111;
  font:700 19px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;box-shadow:0 2px 6px -2px rgba(0,0,0,.3);padding:0}
.cod-map-zoom button:active{transform:scale(.94)}
.cod-picking .cod-map-acc{display:none}
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
  box-shadow:var(--cod-btn-shadow,none);
  transition:background .18s var(--cod-ease),transform .12s var(--cod-ease)}
.cod-submit:active{transform:scale(.985)}
.cod-submit.cod-ready{background:var(--cod-btn-ready)}
.cod-submit:disabled{opacity:.75;cursor:default}
.cod-submit-icon{font-size:1.1em;line-height:1}
${buttonAnimationCss("cod-submit", "var(--cod-btn-solid)")}
${cardAnimationCss("cod-card", '.cod-bump-on,.cod-upsell-on,.cod-offer[aria-checked="true"]')}
.cod-offer[aria-checked="true"].cod-card-anim-march{border-color:var(--cod-offer-accent)!important}
.cod-offer[aria-checked="true"] .cod-card-march{display:none}
.cod-spinner{display:none;width:15px;height:15px;border:2px solid rgba(255,255,255,.35);
  border-top-color:#fff;border-radius:50%;animation:cod-spin .65s linear infinite}
.cod-loading .cod-spinner{display:block}
.cod-loading .cod-submit-label,.cod-loading .cod-submit-icon{opacity:.7}

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
.cod-offers{display:grid;gap:12px;margin-bottom:16px}
.cod-offer{position:relative;display:flex;align-items:center;gap:12px;width:100%;padding:14px 14px;text-align:left;
  border:1.5px var(--offer-border-style,solid) var(--offer-border,var(--cod-border));border-radius:calc(var(--cod-radius) + 6px);background:var(--offer-bg,#fff);
  color:var(--cod-text);font:inherit;cursor:pointer;
  transition:border-color .2s var(--cod-ease),box-shadow .2s var(--cod-ease),transform .15s var(--cod-ease)}
.cod-offer:active{transform:scale(.99)}
.cod-offer-has-badge{margin-top:8px}
.cod-offer[aria-checked="true"]{border:2px solid var(--cod-offer-accent);
  box-shadow:var(--cod-offer-glow,0 0 0 7px color-mix(in srgb,var(--cod-offer-accent) 16%,transparent))}
.cod-offer-ribbon{position:absolute;top:-12px;right:16px;z-index:3;display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;
  background:linear-gradient(90deg,var(--cod-badge-from),var(--cod-badge-to));color:var(--cod-badge-color);
  font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;pointer-events:none}
.cod-offer-ribbon-left{right:auto;left:16px}
.cod-offer-clock{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.cod-offer-ribbon span+.cod-offer-clock{padding-left:6px;border-left:1px solid rgba(255,255,255,.45)}
.cod-offer-dot{width:22px;height:22px;border-radius:50%;border:2px solid #a9b0b8;flex-shrink:0;position:relative;background:#fff}
.cod-offer[aria-checked="true"] .cod-offer-dot{border-color:var(--cod-offer-accent)}
.cod-offer[aria-checked="true"] .cod-offer-dot::after{content:'';position:absolute;inset:4px;border-radius:50%;background:var(--cod-offer-accent)}
.cod-offer-text{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.cod-offer-text b{font-size:15px;font-weight:800}
.cod-offer-text small{font-size:12px;color:var(--cod-muted)}
.cod-offer-save{display:inline-block;margin-top:4px;padding:3px 9px;border-radius:99px;background:var(--cod-save-bg);
  color:var(--cod-save-color);font-size:11px;font-weight:800}
.cod-offer-price{display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;line-height:1.1}
.cod-offer-price b{font-size:17px;font-weight:800}
.cod-offer-price s{font-size:12px;color:var(--cod-muted);margin-top:3px}
.cod-addons{display:grid;gap:9px;margin-top:4px}
.cod-has-tag{margin-top:12px}
.cod-tag{position:absolute;top:-12px;z-index:3;display:inline-flex;align-items:center;gap:6px;max-width:calc(100% - 24px);
  padding:4px 10px;border-radius:999px;background:var(--tag-bg,#e11d48);color:#fff;font-size:11.5px;font-weight:800;line-height:1.2;
  letter-spacing:.01em;white-space:nowrap;box-shadow:0 4px 10px -3px color-mix(in srgb,var(--tag-bg,#e11d48) 60%,transparent),inset 0 1px 0 rgba(255,255,255,.25);
  pointer-events:none}
.cod-tag-right{right:12px}.cod-tag-left{left:12px}
.cod-tag-text{overflow:hidden;text-overflow:ellipsis}
.cod-tag-clock{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}
.cod-tag-text+.cod-tag-clock{padding-left:6px;border-left:1px solid rgba(255,255,255,.45)}
.cod-tag-clock b{font-weight:800}
.cod-bump{position:relative;display:flex;align-items:center;gap:12px;padding:14px 14px;cursor:pointer;
  border-radius:var(--cod-radius);transition:transform .15s var(--cod-ease),box-shadow .2s var(--cod-ease)}
.cod-bump:active{transform:scale(.99)}
.cod-bump-on{box-shadow:0 0 0 3px color-mix(in srgb,var(--cod-ok) 22%,transparent)}
.cod-bump input{position:absolute;opacity:0;width:0;height:0}
.cod-bump-box{flex-shrink:0;width:22px;height:22px;border:2px solid #9a9a9a;border-radius:6px;background:#fff;position:relative;
  transition:background .2s,border-color .2s}
.cod-bump input:checked+.cod-bump-box{background:var(--cod-ok);border-color:var(--cod-ok);animation:cod-bump-pop .3s cubic-bezier(.34,1.56,.64,1)}
@keyframes cod-bump-pop{0%{transform:scale(.7)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.cod-bump input:checked+.cod-bump-box{animation:none}}
.cod-bump input:checked+.cod-bump-box::after{content:'';position:absolute;left:6px;top:2px;width:5px;height:10px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(45deg)}
.cod-bump-img{width:56px;height:56px;object-fit:contain;border-radius:8px;flex-shrink:0}
.cod-bump-text{flex:1;min-width:0}
.cod-bump-title{display:block;font-size:13.5px;line-height:1.35;color:var(--cod-text)}
.cod-bump-title b{font-weight:800}
.cod-bump-text small,.cod-upsell-body small{display:block;font-size:12px;color:var(--cod-muted);margin-top:2px;line-height:1.35}
.cod-bump-price,.cod-upsell-price{display:inline-block;margin-top:3px;font-weight:800;font-size:13.5px;white-space:nowrap}
.cod-bump-price s,.cod-upsell-price s{color:var(--cod-muted);font-weight:400;margin-right:5px;font-size:12px}

.cod-upsell{position:relative;display:flex;align-items:center;gap:11px;padding:12px 13px;
  border-radius:var(--cod-radius);background:var(--cod-surface);animation:cod-in .3s var(--cod-ease) both}
.cod-upsell-on{box-shadow:0 0 0 3px color-mix(in srgb,var(--cod-ok) 22%,transparent)}
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
.cod-ico{display:inline-flex;align-items:center}.cod-ico-svg{width:1.25em;height:1.25em;display:block}
/* La capa ocupa SOLO la parte visible de la pantalla (--cod-vv-*): con el teclado
   abierto la ventana se encoge en vez de taparlo todo, y la X siempre se ve. */
.cod-modal-overlay{position:fixed;left:0;right:0;top:var(--cod-vv-top,0px);height:var(--cod-vv-h,100%);
  z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;
  background:rgba(0,0,0,.55);opacity:0;transition:opacity .22s var(--cod-ease);overscroll-behavior:contain}
.cod-modal-overlay.cod-open{opacity:1}
.cod-modal{position:relative;display:flex;flex-direction:column;width:100%;max-width:440px;
  max-height:calc(var(--cod-vv-h,100vh) - 28px);background:var(--cod-surface);border-radius:20px 20px 0 0;
  transform:translateY(40px);transition:transform .32s cubic-bezier(.34,1.42,.64,1);overflow:hidden}
.cod-modal-overlay.cod-open .cod-modal{transform:none}
.cod-modal-head{position:relative;flex:none;height:44px}
.cod-modal-head::before{content:'';position:absolute;left:50%;top:8px;width:38px;height:4px;margin-left:-19px;
  border-radius:4px;background:rgba(0,0,0,.14)}
.cod-modal-title{display:none}
.cod-modal-close{position:absolute;top:8px;right:10px;z-index:2;display:grid;place-items:center;width:34px;height:34px;
  border:0;border-radius:50%;background:rgba(0,0,0,.07);color:var(--cod-text);cursor:pointer;padding:0}
.cod-modal-close svg{width:18px;height:18px}
.cod-modal-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 14px 14px}
.cod-modal-body .cod-root{box-shadow:none;padding:0 8px 8px}
/* Desde abajo: en computadora se centra como ventana. */
@media(min-width:540px){
  .cod-mode-sheet{align-items:center}
  .cod-mode-sheet .cod-modal{border-radius:18px}
  .cod-mode-sheet .cod-modal-head::before{display:none}
}
/* Ventana flotante: centrada con margen, entra creciendo. */
.cod-mode-popup{align-items:center;padding:14px}
.cod-mode-popup .cod-modal{border-radius:18px;max-height:calc(var(--cod-vv-h,100vh) - 28px);transform:scale(.92);
  box-shadow:0 24px 60px -12px rgba(0,0,0,.45)}
.cod-mode-popup .cod-modal-head::before{display:none}
/* Página completa: ocupa toda la pantalla con su barra arriba. */
.cod-mode-page{align-items:stretch;background:var(--cod-surface);-webkit-backdrop-filter:none;backdrop-filter:none}
.cod-mode-page .cod-modal{max-width:none;max-height:none;height:100%;border-radius:0;transform:translateY(16px)}
.cod-mode-page .cod-modal-head{height:54px;border-bottom:1px solid var(--cod-border);display:flex;align-items:center;justify-content:center}
.cod-mode-page .cod-modal-head::before{display:none}
.cod-mode-page .cod-modal-title{display:block;font-weight:800;font-size:16px;color:var(--cod-text)}
.cod-mode-page .cod-modal-close{top:10px}
.cod-mode-page .cod-modal-body{padding-top:12px}
.cod-mode-page .cod-modal-body>.cod-root{max-width:520px;margin:0 auto}

@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
async function mount(opts) {
  var _a2;
  const host = opts.container;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  shadow.appendChild(style);
  const root = document.createElement("div");
  root.className = "cod-root";
  shadow.appendChild(root);
  root.innerHTML = `<div class="cod-skeleton"><span></span><span></span><span></span></div>`;
  if (host.dataset.mode !== "embedded") void import("./trigger-C6-wci_R.js").catch(() => void 0);
  let config;
  try {
    config = await api.config(opts.productId, opts.variantId);
  } catch (e) {
    if (((_a2 = window.Shopify) == null ? void 0 : _a2.designMode) && !host.dataset.floating) {
      const notFound = e instanceof ApiError && e.status === 404;
      root.innerHTML = `<div style="padding:12px;border:1.5px dashed #b5b5b5;border-radius:10px;color:#666;font:14px/1.4 system-ui;text-align:center"><b>Formulario COD</b><br>${notFound ? "Este producto no tiene un formulario asignado. En la app, abre el formulario → Ajustes → «¿En qué productos se muestra?» y elige este producto o todos." : "No se pudo cargar el formulario. Revisa que la app esté instalada y vuelve a intentarlo."}</div>`;
      return;
    }
    host.remove();
    return;
  }
  style.textContent = `:host{${tokensToCss(config.tokens)}}
${CSS}
${config.tokens.customCss}`;
  preloadParts(config);
  const isCart = host.dataset.cart === "true";
  const renderInto = (mountRoot) => {
    if (isCart) {
      renderCartInto(mountRoot, config);
      return;
    }
    const state = new FormState(config);
    state.productId = opts.productId;
    const fromPage = pageQuantityInfo(state.variantId);
    if (fromPage && (fromPage.qty > 1 || fromPage.managed)) {
      state.qty = fromPage.qty;
      state.qtyFromPage = true;
    }
    if (fromPage == null ? void 0 : fromPage.managed) state.pageManagesQty = true;
    renderForm(mountRoot, config, state, {
      onSubmit: () => submit(mountRoot, config, state)
    });
    const sync = () => {
      followPageVariant(opts.productId, state);
      const q = pageQuantity(state.variantId);
      if (q) state.setQtyFromPage(q);
    };
    followPageVariant(opts.productId, state);
    const watch = window.setInterval(() => {
      if (!mountRoot.isConnected) {
        if (!keptRoots.has(mountRoot)) window.clearInterval(watch);
        return;
      }
      if (mountRoot.querySelector(".cod-done")) {
        window.clearInterval(watch);
        return;
      }
      void followPageVariant(opts.productId, state);
    }, 500);
    mountRoot.codSync = sync;
    const follow = () => window.setTimeout(() => {
      if (!mountRoot.isConnected) {
        if (!keptRoots.has(mountRoot)) document.removeEventListener("change", follow, true);
        return;
      }
      sync();
    }, 60);
    document.addEventListener("change", follow, true);
  };
  const mode = isCart ? "popup" : host.dataset.mode === "popup" || host.dataset.mode === "embedded" ? host.dataset.mode : config.displayMode === "POPUP" ? "popup" : "embedded";
  if (mode === "popup") {
    const { renderTrigger } = await import("./trigger-C6-wci_R.js");
    root.innerHTML = "";
    root.classList.add("cod-root-trigger");
    const floating = host.dataset.floating === "true";
    host.dataset.codRendered = "button";
    if (floating) {
      host.style.cssText = "position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147482000;display:flex;justify-content:center;transition:opacity .25s ease,transform .25s ease;";
      hideWhileInlineVisible(host);
    }
    renderTrigger(root, config.tokens.trigger, () => {
      const inlineForm = floating ? findInline("form") : null;
      if (inlineForm) {
        inlineForm.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!isCart && (DIRECT == null ? void 0 : DIRECT.cartButton) && cartOpen()) {
        void openCartForm();
        return;
      }
      fireCheckoutPixel(config);
      openModal(shadow, config, renderInto, isCart ? void 0 : `${config.formId}:${config.product.variantId}`);
    });
    try {
      api.track(config.formId, "view", config.formVersionId);
    } catch {
    }
    if (!floating && !isCart) ensureFloating(host);
    return;
  }
  root.innerHTML = "";
  host.dataset.codRendered = "form";
  renderInto(root);
  ensureFloating(host);
  try {
    api.track(config.formId, "view", config.formVersionId);
  } catch {
  }
  root.addEventListener("focusin", () => fireCheckoutPixel(config), { once: true });
}
let preloaded = false;
function preloadParts(config) {
  if (preloaded) return;
  preloaded = true;
  const go = () => {
    if (config.addons.length) void import("./addons-D4nrFYRq.js").catch(() => void 0);
    if (config.fields.some((f) => f.type === "location")) void import("./map-DZEdKjFO.js").catch(() => void 0);
  };
  const ric = window.requestIdleCallback;
  if (ric) ric(go, { timeout: 2500 });
  else window.setTimeout(go, 1200);
}
function renderCartInto(mountRoot, config) {
  mountRoot.innerHTML = `<div class="cod-skeleton"><span></span><span></span><span></span></div>`;
  readCartFull().then(({ lines, token, totalCents }) => {
    if (!mountRoot.isConnected) return;
    if (!lines.length) {
      mountRoot.innerHTML = '<div class="cod-form-error" role="alert">Tu carrito está vacío.</div>';
      return;
    }
    const state = new FormState(config);
    state.cart = lines.map((l) => ({ variantId: l.variantId, qty: l.qty }));
    state.cartToken = token;
    state.cartTotalCents = totalCents;
    state.pageManagesQty = true;
    renderForm(mountRoot, config, state, { onSubmit: () => submit(mountRoot, config, state) });
  }).catch(() => {
    if (mountRoot.isConnected) mountRoot.innerHTML = '<div class="cod-form-error" role="alert">No pudimos leer tu carrito. Recarga la página e inténtalo de nuevo.</div>';
  });
}
function inlineHosts() {
  return [...document.querySelectorAll("[data-cod-form]")].filter((el) => el.dataset.floating !== "true");
}
function fixedHosts() {
  return inlineHosts().filter((el) => el.dataset.cart !== "true" && el.isConnected && !el.closest(CART_AREA));
}
function findInline(kind) {
  var _a2;
  return (_a2 = fixedHosts().find((el) => el.dataset.codRendered === kind && el.getClientRects().length > 0)) != null ? _a2 : null;
}
const CART_AREA = '#pd-cart, .pd-panel, cart-drawer, cart-notification, [id*="CartDrawer"], [id*="cart-drawer"], [class*="cart-drawer"], [class*="CartDrawer"], [class*="mini-cart"], [class*="minicart"], [id*="mini-cart"], [role="dialog"]';
function ensureFloating(from) {
  var _a2, _b;
  if (!(DIRECT == null ? void 0 : DIRECT.floating) || from.dataset.floating === "true" || from.dataset.cart === "true") return;
  if (from.closest(CART_AREA)) return;
  if (document.querySelector('[data-cod-form][data-floating="true"]')) return;
  const el = document.createElement("div");
  el.setAttribute("data-cod-form", "");
  el.dataset.mode = "popup";
  el.dataset.floating = "true";
  el.dataset.codAutoFloat = "1";
  el.dataset.productId = (_a2 = from.dataset.productId) != null ? _a2 : "";
  el.dataset.variantId = (_b = from.dataset.variantId) != null ? _b : "";
  document.body.appendChild(el);
}
function hideWhileInlineVisible(floatingHost) {
  if (!("IntersectionObserver" in window)) return;
  const visible = /* @__PURE__ */ new Set();
  const apply = () => {
    for (const el of visible) if (!el.isConnected) visible.delete(el);
    const hide = visible.size > 0 || overlayOpen() || cartOpen();
    floatingHost.style.opacity = hide ? "0" : "1";
    floatingHost.style.transform = hide ? "translateY(120%)" : "none";
    floatingHost.style.pointerEvents = hide ? "none" : "auto";
    floatingHost.setAttribute("aria-hidden", String(hide));
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.target.isConnected) visible.add(e.target);
      else visible.delete(e.target);
    }
    apply();
  }, { threshold: 0.15 });
  const watched = /* @__PURE__ */ new WeakSet();
  let mo = null;
  const scan = () => {
    if (floatingHost.dataset.codAutoFloat && !fixedHosts().length) {
      floatingHost.remove();
      io.disconnect();
      mo == null ? void 0 : mo.disconnect();
      return;
    }
    inlineHosts().forEach((el) => {
      if (!watched.has(el)) {
        watched.add(el);
        io.observe(el);
      }
    });
    apply();
  };
  scan();
  mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });
  let queued = false;
  new MutationObserver(() => {
    if (queued || !floatingHost.isConnected) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class", "aria-hidden", "open", "aria-modal"] });
}
const OVERLAY = '[role="dialog"]:not([aria-hidden="true"]), [aria-modal="true"], dialog[open], cart-drawer[open], cart-drawer.active, .drawer.active, .is-open[role="dialog"]';
function overlayOpen() {
  return [...document.querySelectorAll(OVERLAY)].some((el) => {
    if (el.closest("[data-cod-form], [data-cod-modal]")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= window.innerHeight) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  });
}
const CART_OPEN = '#pd-cart.is-open, .pd-panel.is-open, cart-drawer[open], cart-drawer.active, cart-drawer.is-open, .cart-drawer.active, .cart-drawer.is-open, .cart-drawer--active, [id*="CartDrawer"].active, [id*="CartDrawer"].is-open, [id*="cart-drawer"].active, [id*="cart-drawer"].is-open, .drawer--cart.is-open';
let lastCartTap = 0;
const markCartTap = (e) => {
  var _a2;
  const t = e.target;
  if (!((_a2 = t == null ? void 0 : t.closest) == null ? void 0 : _a2.call(t, `${CART_OPEN}, #pd-cart, .pd-panel, cart-drawer, [id*="CartDrawer"], [class*="cart-drawer"]`))) return;
  if (t.closest('[data-pd-close], [aria-label*="errar"], [aria-label*="lose"], .close, [class*="overlay"], [class*="close"]')) return;
  lastCartTap = Date.now();
};
document.addEventListener("pointerdown", markCartTap, true);
document.addEventListener("click", markCartTap, true);
function cartOpen() {
  if (Date.now() - lastCartTap < 1e3) return true;
  const big = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
  };
  return [...document.querySelectorAll(CART_OPEN)].some((el) => {
    if (el.closest("[data-cod-form], [data-cod-modal]")) return false;
    return big(el) || [...el.children].some((c) => big(c) && getComputedStyle(c).visibility !== "hidden");
  });
}
const CART_TRIGGERS = '[data-pd-rsi-cart], a[href*="pd_cod=1"], [data-cod-open-cart]';
const RELEASIT = "#rsi_buy_now_button, .rsi_animation_shake, [data-rsi-cod-button], ._rsi-buy-now-button-app-block-hook button";
const onCartPage = () => /\/cart\/?$/.test(location.pathname);
function openProductForm() {
  var _a2;
  const host = [...document.querySelectorAll('[data-cod-form][data-cod-rendered="button"]')].find((el) => {
    var _a3;
    return el.dataset.cart !== "true" && ((_a3 = el.shadowRoot) == null ? void 0 : _a3.querySelector(".cod-trigger"));
  });
  const btn = (_a2 = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _a2.querySelector(".cod-trigger");
  if (!btn) return false;
  btn.click();
  return true;
}
let cartOpening = false;
async function openCartForm() {
  if (cartOpening) return;
  cartOpening = true;
  try {
    const lines = await readCart();
    if (!lines.length) return;
    const seen = /* @__PURE__ */ new Set();
    for (const l of lines) {
      if (seen.has(l.productId)) continue;
      seen.add(l.productId);
      let config;
      try {
        config = await api.config(l.productId, l.variantId);
      } catch {
        continue;
      }
      openModal(null, config, (root) => renderCartInto(root, config));
      try {
        api.track(config.formId, "view", config.formVersionId);
      } catch {
      }
      fireCheckoutPixel(config);
      return;
    }
  } catch {
  } finally {
    cartOpening = false;
  }
}
const keptForms = /* @__PURE__ */ new Map();
const keptRoots = /* @__PURE__ */ new WeakSet();
function openModal(shadow, config, renderInto, keepKey) {
  var _a2, _b, _c;
  document.querySelectorAll("[data-cod-modal]").forEach((el) => el.remove());
  const portal = document.createElement("div");
  portal.setAttribute("data-cod-modal", "");
  portal.style.cssText = "position:fixed;inset:0;z-index:2147483600;";
  const pshadow = portal.attachShadow({ mode: "open" });
  if (shadow) shadow.querySelectorAll("style").forEach((st) => pshadow.appendChild(st.cloneNode(true)));
  else {
    const st = document.createElement("style");
    st.textContent = `:host{${tokensToCss(config.tokens)}}
${CSS}
${config.tokens.customCss}`;
    pshadow.appendChild(st);
  }
  document.body.appendChild(portal);
  const overlay = document.createElement("div");
  overlay.className = `cod-modal-overlay cod-mode-${(_a2 = config.tokens.display) != null ? _a2 : "sheet"}`;
  const vv = window.visualViewport;
  let fitTop = -1, fitH = -1, fitRaf = 0;
  const fit = () => {
    if (!vv || fitRaf) return;
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      const t = Math.round(vv.offsetTop), h = Math.round(vv.height);
      if (t !== fitTop) {
        fitTop = t;
        overlay.style.setProperty("--cod-vv-top", `${t}px`);
      }
      if (h !== fitH) {
        fitH = h;
        overlay.style.setProperty("--cod-vv-h", `${h}px`);
      }
    });
  };
  if (vv) {
    fitTop = Math.round(vv.offsetTop);
    fitH = Math.round(vv.height);
    overlay.style.setProperty("--cod-vv-top", `${fitTop}px`);
    overlay.style.setProperty("--cod-vv-h", `${fitH}px`);
  }
  vv == null ? void 0 : vv.addEventListener("resize", fit, { passive: true });
  vv == null ? void 0 : vv.addEventListener("scroll", fit, { passive: true });
  const pausedHosts = [...document.querySelectorAll("[data-cod-form]")];
  pausedHosts.forEach((h) => h.setAttribute("data-cod-paused", ""));
  const modal = document.createElement("div");
  modal.className = "cod-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `<div class="cod-modal-head"><span class="cod-modal-title">${(config.tokens.submit.text || "").replace(/[<>&"]/g, "")}</span><button type="button" class="cod-modal-close" aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="cod-modal-body"></div>`;
  overlay.appendChild(modal);
  pshadow.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => overlay.classList.add("cod-open"));
  let pushed = false;
  try {
    history.pushState({ ...(_b = history.state) != null ? _b : {}, codModal: true }, "");
    pushed = true;
  } catch {
  }
  const onPop = () => close(true);
  if (pushed) window.addEventListener("popstate", onPop);
  let closed = false;
  const close = (fromBack = false) => {
    var _a3;
    if (closed) return;
    closed = true;
    window.removeEventListener("popstate", onPop);
    if (pushed && !fromBack && ((_a3 = history.state) == null ? void 0 : _a3.codModal)) {
      try {
        history.back();
      } catch {
      }
    }
    if (keepKey && formRoot.isConnected && !formRoot.querySelector(".cod-done")) {
      keptForms.set(keepKey, formRoot);
      keptRoots.add(formRoot);
    } else if (keepKey) keptForms.delete(keepKey);
    overlay.classList.remove("cod-open");
    document.body.style.overflow = prevOverflow;
    document.removeEventListener("keydown", esc2);
    vv == null ? void 0 : vv.removeEventListener("resize", fit);
    vv == null ? void 0 : vv.removeEventListener("scroll", fit);
    if (fitRaf) cancelAnimationFrame(fitRaf);
    pausedHosts.forEach((h) => h.removeAttribute("data-cod-paused"));
    setTimeout(() => portal.remove(), 250);
  };
  const esc2 = (e) => {
    if (e.key === "Escape") close();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector(".cod-modal-close").addEventListener("click", () => close());
  document.addEventListener("keydown", esc2);
  const kept = keepKey ? keptForms.get(keepKey) : void 0;
  const formRoot = kept != null ? kept : document.createElement("div");
  if (!kept) formRoot.className = "cod-root";
  modal.querySelector(".cod-modal-body").appendChild(formRoot);
  if (kept) {
    keptForms.delete(keepKey);
    keptRoots.delete(kept);
    (_c = kept.codSync) == null ? void 0 : _c.call(kept);
  } else {
    renderInto(formRoot);
  }
}
class FormState {
  constructor(config) {
    __publicField(this, "values", {});
    __publicField(this, "qty", 1);
    /** La cantidad la eligió el cliente en la página (oferta o selector del tema). */
    __publicField(this, "qtyFromPage", false);
    /** La página tiene su propia caja de ofertas: el formulario no las repite. */
    __publicField(this, "pageManagesQty", false);
    /** Pedido desde el carrito: todas sus líneas (si no, el producto del formulario). */
    __publicField(this, "cart", null);
    __publicField(this, "cartToken", "");
    __publicField(this, "cartTotalCents", 0);
    __publicField(this, "qtyListeners", []);
    __publicField(this, "location", null);
    __publicField(this, "discountCode", null);
    __publicField(this, "acceptedAddons", []);
    __publicField(this, "idempotencyKey");
    /**
     * Variante que se pide. Empieza con la de la página al cargar y sigue al
     * cliente si elige otra talla/color en la página (validada por el servidor).
     */
    __publicField(this, "variantId");
    /** Producto del formulario (para validar la variante elegida en la página). */
    __publicField(this, "productId", "");
    /** Precio de la variante elegida (para las tarjetas de cantidad). */
    __publicField(this, "unitPriceCents");
    __publicField(this, "variantListeners", []);
    /** Última cotización del servidor (precio real, descuento validado). */
    __publicField(this, "quote", null);
    /** Quién cotiza: la API en la tienda; un cálculo local en la vista previa del panel. */
    __publicField(this, "quoter", (r) => api.quote(r));
    __publicField(this, "quoteListeners", []);
    __publicField(this, "quoteKey", "");
    __publicField(this, "quoteTimer", 0);
    __publicField(this, "startedAt", Date.now());
    /** Ofertas y extras que se ven ahora (cambia con la provincia). */
    __publicField(this, "shownKey", "");
    /** Ya se aplicó la tarjeta «marcada de inicio» (solo una vez, al abrir). */
    __publicField(this, "preselectDone", false);
    /** Recotiza (con pausa de 300 ms) solo si cambió algo que afecta al precio. */
    __publicField(this, "quoteSeq", 0);
    this.config = config;
    this.idempotencyKey = crypto.randomUUID();
    this.variantId = config.product.variantId;
    this.unitPriceCents = config.product.unitPriceCents;
    for (const f of config.fields) {
      if (f.defaultValue) this.values[f.key] = f.defaultValue;
    }
  }
  onQuote(fn) {
    this.quoteListeners.push(fn);
  }
  onQtyChange(fn) {
    this.qtyListeners.push(fn);
  }
  onVariantChange(fn) {
    this.variantListeners.push(fn);
  }
  /** Provincia del cliente: la que eligió a mano o la del mapa (null si aún no). */
  province() {
    return this.values.province || this.values.provinceCode || null;
  }
  /** El cliente eligió otra variante en la página: el pedido y el precio la siguen. */
  setVariant(variantId, unitPriceCents) {
    if (variantId === this.variantId) return;
    this.variantId = variantId;
    this.unitPriceCents = unitPriceCents;
    this.variantListeners.forEach((fn) => fn());
    this.requestQuote();
  }
  /** Cambio de cantidad que viene de la página (no de las tarjetas del formulario). */
  setQtyFromPage(q) {
    if (q === this.qty) return;
    this.qty = q;
    this.qtyFromPage = true;
    this.qtyListeners.forEach((fn) => fn(q));
  }
  quoteInput(discountCode = this.discountCode) {
    return {
      formId: this.config.formId,
      variantId: this.variantId,
      qty: this.qty,
      province: this.province(),
      discountCode,
      addonIds: this.acceptedAddons.map((a) => a.id),
      ...this.cart ? { cart: this.cart, cartToken: this.cartToken, cartTotalCents: this.cartTotalCents } : {}
    };
  }
  requestQuote() {
    const key = JSON.stringify(this.quoteInput());
    if (key === this.quoteKey) return;
    this.quoteKey = key;
    window.clearTimeout(this.quoteTimer);
    this.quoteTimer = window.setTimeout(() => {
      const seq = ++this.quoteSeq;
      this.quoter(this.quoteInput()).then((q) => {
        if (seq !== this.quoteSeq) return;
        this.quote = q;
        this.quoteListeners.forEach((fn) => fn(q));
      }).catch(() => {
        if (seq === this.quoteSeq) this.quoteKey = "";
      });
    }, 120);
  }
  /** Valida un código en el servidor. Devuelve la cotización con o sin el descuento aplicado. */
  async applyDiscount(code) {
    const seq = ++this.quoteSeq;
    window.clearTimeout(this.quoteTimer);
    const q = await this.quoter(this.quoteInput(code));
    if (seq !== this.quoteSeq) return q;
    this.discountCode = q.appliedDiscount ? q.appliedDiscount.code : null;
    this.quote = q;
    this.quoteKey = JSON.stringify(this.quoteInput());
    this.quoteListeners.forEach((fn) => fn(q));
    return q;
  }
  visibleFields() {
    return this.config.fields.filter((f) => isVisible(f, this.values));
  }
  /** Devuelve los errores por campo. Vacío = válido. */
  validate() {
    var _a2;
    const errors = {};
    for (const f of this.visibleFields()) {
      const err = validateField(f, (_a2 = this.values[f.key]) != null ? _a2 : "");
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
  const priceBefore = state.unitPriceCents;
  await followPageVariant(state.productId, state);
  if (state.unitPriceCents !== priceBefore) {
    btn.disabled = false;
    btn.classList.remove("cod-loading");
    errBox.textContent = "Actualizamos el precio según la opción que elegiste. Revisa el total y toca de nuevo para pedir.";
    return;
  }
  const addonEls = root.querySelectorAll("[data-addon-id]");
  if (addonEls.length) {
    const on = new Set([...addonEls].filter((el) => {
      var _a2;
      return el.classList.contains("cod-upsell-on") || !!((_a2 = el.querySelector('input[type="checkbox"]')) == null ? void 0 : _a2.checked);
    }).map((el) => el.dataset.addonId));
    state.acceptedAddons = config.addons.filter((a) => on.has(a.id)).map((a) => ({ id: a.id, variantId: a.variantId, qty: a.qty }));
  }
  const payload = {
    formId: config.formId,
    formVersionId: config.formVersionId,
    idempotencyKey: state.idempotencyKey,
    variantId: state.variantId,
    qty: state.qty,
    discountCode: state.discountCode,
    acceptedAddons: state.acceptedAddons,
    fields: state.values,
    ...state.cart ? { cart: state.cart, cartToken: state.cartToken, cartTotalCents: state.cartTotalCents } : {},
    location: state.location,
    startedAt: state.startedAt,
    hp: "",
    // honeypot: si un bot lo rellena, el backend rechaza
    attribution: metaAttribution()
  };
  try {
    const res = await api.submit(payload);
    if (state.cart) clearCart();
    try {
      api.track(config.formId, "submit_attempt", state.idempotencyKey);
    } catch {
    }
    showConfirmation(root, res, state.idempotencyKey);
  } catch (e) {
    btn.disabled = false;
    btn.classList.remove("cod-loading");
    errBox.textContent = e instanceof ApiError ? e.message : "No pudimos enviar tu pedido. Inténtalo de nuevo.";
    errBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
function showConfirmation(root, res, key) {
  var _a2;
  const goWhatsapp = res.redirectTarget === "whatsapp" && !!res.whatsappUrl;
  const willRedirect = goWhatsapp || res.redirectTarget === "thankyou";
  if (res.purchasePixel) firePurchasePixel(res.purchasePixel);
  root.innerHTML = `
    <div class="cod-done">
      <div class="cod-done-tick">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"
             stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h3>${escapeHtml(res.title)}</h3>
      ${res.message ? `<p>${escapeHtml(res.message)}</p>` : ""}
      ${willRedirect ? `<div class="cod-done-bar"><span style="animation-duration:${res.redirectDelayMs}ms"></span></div>` : ""}
    </div>`;
  (_a2 = root.querySelector(".cod-done")) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth", block: "center" });
  if (!willRedirect) return;
  const statusUrl = waitForStatusUrl(res.submissionId, key, Math.max(res.redirectDelayMs, 2500) + 6e3);
  const delay = new Promise((r) => window.setTimeout(r, res.redirectDelayMs));
  void Promise.all([statusUrl.peek(Math.max(res.redirectDelayMs, 2500)), delay]).then(([url2]) => {
    if (!goWhatsapp) {
      window.location.assign(url2 || res.redirectUrl);
      return;
    }
    const toStatus = (u) => {
      if (!u) return;
      try {
        const t = new URL(u, location.href);
        if (t.origin === location.origin) history.replaceState(history.state, "", t.pathname + t.search + t.hash);
      } catch {
      }
      let wasHidden = document.visibilityState === "hidden";
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") wasHidden = true;
        else if (wasHidden) window.location.replace(u);
      });
      window.addEventListener("pageshow", (e) => {
        if (e.persisted) window.location.replace(u);
      });
    };
    if (url2) toStatus(url2);
    else void statusUrl.done.then(toStatus);
    window.location.assign(res.whatsappUrl);
  });
}
function waitForStatusUrl(submissionId, key, maxMs) {
  const until = Date.now() + maxMs;
  const done = (async () => {
    while (Date.now() < until) {
      try {
        const r = await api.orderStatus(submissionId, key);
        if (r.ready && r.url) return r.url;
      } catch {
      }
      await new Promise((r) => window.setTimeout(r, 700));
    }
    return null;
  })();
  return {
    done,
    peek: (ms) => Promise.race([done, new Promise((r) => window.setTimeout(() => r(null), ms))])
  };
}
function metaAttribution() {
  try {
    const ck = (n) => {
      var _a2;
      return (_a2 = document.cookie.split("; ").find((c) => c.startsWith(n + "="))) == null ? void 0 : _a2.slice(n.length + 1);
    };
    let fbc = ck("_fbc");
    const fbclid = new URLSearchParams(location.search).get("fbclid");
    if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    return { fbp: ck("_fbp") || void 0, fbc: fbc || void 0, url: location.href.slice(0, 1e3) };
  } catch {
    return {};
  }
}
function ensureFbq(pixelId) {
  var _a2, _b;
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
  }
  (_a2 = w.__codFbqInit) != null ? _a2 : w.__codFbqInit = {};
  if (!w.__codFbqInit[pixelId]) {
    w.__codFbqInit[pixelId] = true;
    w.fbq("init", pixelId);
  }
  return (_b = w.fbq) != null ? _b : null;
}
let shopifyPixelsCache = null;
function shopifyMetaPixels() {
  var _a2;
  if (shopifyPixelsCache) return shopifyPixelsCache;
  const found = /* @__PURE__ */ new Set();
  try {
    const re = /\\?"pixel_id\\?"\s*:\s*\\?"(\d{6,20})\\?"\s*,\s*\\?"pixel_type\\?"\s*:\s*\\?"facebook_pixel/g;
    for (const s of Array.from(document.scripts)) {
      if (s.src) continue;
      const text = (_a2 = s.textContent) != null ? _a2 : "";
      if (!text.includes("pixel_id")) continue;
      for (const m of text.matchAll(re)) found.add(m[1]);
    }
  } catch {
  }
  shopifyPixelsCache = Array.from(found).slice(0, 5);
  return shopifyPixelsCache;
}
function metaPixelIds(configured) {
  return Array.from(/* @__PURE__ */ new Set([...configured ? [configured] : [], ...shopifyMetaPixels()]));
}
function trackMeta(ids, event, data, opts) {
  for (const id of ids) {
    const fbq = ensureFbq(id);
    if (fbq) fbq("trackSingle", id, event, data, ...opts ? [opts] : []);
  }
}
let checkoutFired = false;
function fireCheckoutPixel(config) {
  var _a2, _b;
  try {
    const ids = metaPixelIds(config.settings.tracking.metaPixelId);
    if (!ids.length || checkoutFired) return;
    checkoutFired = true;
    trackMeta(ids, "InitiateCheckout", { currency: config.settings.currency, value: ((_b = (_a2 = config.product) == null ? void 0 : _a2.unitPriceCents) != null ? _b : 0) / 100 });
  } catch {
  }
}
function firePurchasePixel(p) {
  var _a2;
  const value = p.valueCents / 100;
  try {
    const metaIds = metaPixelIds(p.metaPixelId);
    if (metaIds.length) trackMeta(metaIds, p.eventName, { currency: p.currency, value }, { eventID: p.eventId });
    if (p.tiktokPixelId) {
      const w = window;
      (_a2 = w.ttq) == null ? void 0 : _a2.track("CompletePayment", { currency: p.currency, value, event_id: p.eventId });
    }
  } catch {
  }
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function autoPlace() {
  placeCartButtons();
  const manualShown = () => fixedHosts().some((el) => !el.dataset.codAuto && el.getClientRects().length > 0);
  if (manualShown()) document.querySelectorAll("[data-cod-auto]").forEach((el) => el.remove());
  document.querySelectorAll("[data-cod-autoplace]").forEach((marker) => {
    var _a2, _b, _c;
    if (manualShown()) {
      marker.remove();
      return;
    }
    const anchor = findBuyAnchor(((_a2 = marker.dataset.variantId) != null ? _a2 : "").replace(/\D/g, ""));
    if (!anchor) return;
    const el = document.createElement("div");
    el.setAttribute("data-cod-form", "");
    el.dataset.mode = "popup";
    el.dataset.codAuto = "1";
    el.dataset.productId = (_b = marker.dataset.productId) != null ? _b : "";
    el.dataset.variantId = (_c = marker.dataset.variantId) != null ? _c : "";
    el.style.margin = "10px 0";
    anchor.insertAdjacentElement("afterend", el);
    marker.remove();
  });
}
const CHECKOUT = 'button[name="checkout"], input[name="checkout"], button#checkout, a[href$="/checkout"]';
function placeCartButtons() {
  if (!(DIRECT == null ? void 0 : DIRECT.cartButton)) return;
  if (onCartPage()) placeOnCartPage();
  document.querySelectorAll(CHECKOUT).forEach((btn) => {
    var _a2;
    if (btn.closest("[data-cod-form], [data-cod-modal]")) return;
    const parent = btn.parentElement;
    const row = parent && parent.tagName !== "FORM" && getComputedStyle(parent).display.includes("flex") && !getComputedStyle(parent).flexDirection.startsWith("column");
    const anchor = row ? parent : btn;
    const next = anchor.nextElementSibling;
    if ((next == null ? void 0 : next.dataset.cart) === "true") return;
    if ((_a2 = anchor.parentElement) == null ? void 0 : _a2.querySelector(':scope > [data-cod-form][data-cart="true"]')) return;
    const el = document.createElement("div");
    el.setAttribute("data-cod-form", "");
    el.dataset.mode = "popup";
    el.dataset.cart = "true";
    el.style.cssText = "display:block;width:100%;margin:10px 0 0;";
    anchor.insertAdjacentElement("afterend", el);
  });
}
function placeOnCartPage() {
  var _a2, _b, _c, _d, _e, _f, _g;
  const shown = (e) => e.getClientRects().length > 0;
  const ours = document.querySelector("[data-cod-cart-page]");
  const theirs = [...document.querySelectorAll(RELEASIT)].some((b) => shown(b) && !b.closest("[data-cod-form]"));
  const checkout = [...document.querySelectorAll(CHECKOUT)].some((b) => shown(b) && !b.closest("[data-cod-form], [data-cod-modal]"));
  if (theirs || checkout) {
    ours == null ? void 0 : ours.remove();
    return;
  }
  if (ours == null ? void 0 : ours.isConnected) return;
  const total = document.querySelector("[data-mc-total], .mc-total__val, .totals__total-value, [data-cart-total], .cart__total, .cart-subtotal__price");
  const anchor = (_g = (_f = (_e = (_c = (_b = (_a2 = document.querySelector(".rsi-app-block-container")) == null ? void 0 : _a2.closest(".mc-appblock")) != null ? _b : document.querySelector(".rsi-app-block-container")) != null ? _c : document.querySelector(".mc-summary .mc-total")) != null ? _e : (_d = total == null ? void 0 : total.parentElement) == null ? void 0 : _d.closest(".mc-total, .totals, .cart__totals, .cart-subtotal, .totals__total")) != null ? _f : total == null ? void 0 : total.parentElement) != null ? _g : null;
  if (!anchor) return;
  const el = document.createElement("div");
  el.setAttribute("data-cod-form", "");
  el.dataset.mode = "popup";
  el.dataset.cart = "true";
  el.dataset.codCartPage = "1";
  el.style.cssText = "display:block;width:100%;margin:14px 0 4px;";
  anchor.insertAdjacentElement("afterend", el);
}
function pageQuantity(variantId) {
  var _a2, _b;
  return (_b = (_a2 = pageQuantityInfo(variantId)) == null ? void 0 : _a2.qty) != null ? _b : null;
}
function pageQuantityInfo(variantId) {
  var _a2, _b;
  const fromBox = offerBoxQty();
  if (fromBox) return { qty: fromBox, managed: true };
  const variant = variantId.replace(/\D/g, "");
  const forms = [...document.querySelectorAll('form[action*="/cart/add"]')].filter((f) => !f.closest("[data-cod-form]") && !f.closest(CARD) && f.querySelector('[name="quantity"]'));
  const idOf = (f) => {
    var _a3, _b2;
    return (_b2 = (_a3 = f.querySelector('[name="id"]')) == null ? void 0 : _a3.value) != null ? _b2 : "";
  };
  const form = (_b = (_a2 = forms.find((f) => idOf(f) === variant)) != null ? _a2 : forms.find((f) => f.closest('main, #MainContent, [id*="main"], [id*="product-information"], [id*="product-template"]'))) != null ? _b : null;
  const input = form == null ? void 0 : form.querySelector('[name="quantity"]');
  const q = Math.floor(Number(input == null ? void 0 : input.value));
  if (!input || !Number.isFinite(q) || q < 1 || q > 99) return null;
  return { qty: q, managed: input instanceof HTMLInputElement && input.type === "hidden" };
}
function pageVariant() {
  var _a2, _b, _c, _d;
  if (!/\/products\//.test(location.pathname)) return null;
  const forms = [...document.querySelectorAll('form[action*="/cart/add"]')].filter((f) => !f.closest("[data-cod-form], [data-cod-modal]") && !f.closest(CARD));
  const main = (_a2 = forms.find((f) => f.closest('main, #MainContent, [id*="main"], [id*="product-information"], [id*="product-template"]'))) != null ? _a2 : forms.length === 1 ? forms[0] : void 0;
  let id = (_c = (_b = main == null ? void 0 : main.querySelector('[name="id"]')) == null ? void 0 : _b.value) != null ? _c : "";
  if (!/^\d+$/.test(id)) id = (_d = new URLSearchParams(location.search).get("variant")) != null ? _d : "";
  return /^\d+$/.test(id) ? `gid://shopify/ProductVariant/${id}` : null;
}
function followPageVariant(productId, state) {
  const v = state.cart ? null : pageVariant();
  if (!productId || !v || v === state.variantId) return Promise.resolve();
  return api.config(productId, v).then((c) => {
    if (pageVariant() === v) state.setVariant(c.product.variantId, c.product.unitPriceCents);
  }).catch(() => void 0);
}
function offerRadio(el) {
  var _a2, _b, _c;
  if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !/^\d{1,2}$/.test(el.value)) return null;
  if (el.closest("[data-cod-form], [data-cod-modal]")) return null;
  const label = (_b = (_a2 = el.closest("label")) != null ? _a2 : el.id ? document.querySelector(`label[for="${window.CSS.escape(el.id)}"]`) : null) != null ? _b : el.parentElement;
  return label && /(RD\s?\$|US\s?\$|\$|€|£)\s?\d/.test((_c = label.textContent) != null ? _c : "") ? el : null;
}
let lastOfferQty = null;
document.addEventListener("change", (e) => {
  const r = offerRadio(e.target);
  if (r == null ? void 0 : r.checked) lastOfferQty = Number(r.value);
}, true);
function offerBoxQty() {
  var _a2;
  if (lastOfferQty && lastOfferQty >= 1 && lastOfferQty <= 50) return lastOfferQty;
  const checked = [...document.querySelectorAll('input[type="radio"]:checked')].map(offerRadio).filter((r2) => !!r2 && !r2.closest(CARD));
  const r = (_a2 = checked.find((x) => {
    var _a3;
    return ((_a3 = x.closest("label")) != null ? _a3 : x).getClientRects().length > 0;
  })) != null ? _a2 : checked[0];
  const q = r ? Number(r.value) : 0;
  return q >= 1 && q <= 50 ? q : null;
}
const CARD = 'product-card, .card, .card-wrapper, [class*="product-card"], [class*="related"], [class*="recommend"], [id*="related"], [id*="recommend"]';
function findBuyAnchor(variant) {
  var _a2, _b, _c, _d;
  const shown = (e) => e.getClientRects().length > 0;
  const forms = [...document.querySelectorAll('form[action*="/cart/add"]')].filter((f) => !f.closest("[data-cod-form]") && shown(f) && f.querySelector('button[type="submit"], button[name="add"], input[type="submit"]'));
  const idOf = (f) => {
    var _a3, _b2;
    return (_b2 = (_a3 = f.querySelector('[name="id"]')) == null ? void 0 : _a3.value) != null ? _b2 : "";
  };
  const form = (_b = (_a2 = forms.find((f) => idOf(f) === variant)) != null ? _a2 : forms.find((f) => !f.closest(CARD) && f.closest('[id*="main"], [id*="product-information"], [id*="product-template"]'))) != null ? _b : null;
  if (form) return (_c = form.closest("product-form, product-form-component")) != null ? _c : form;
  const radio = [...document.querySelectorAll('input[type="radio"]')].map(offerRadio).find((r) => {
    var _a3;
    return r && !r.closest(CARD) && shown((_a3 = r.closest("label")) != null ? _a3 : r);
  });
  const box = (_d = radio == null ? void 0 : radio.closest("[data-pd-offers]")) != null ? _d : radio == null ? void 0 : radio.closest('fieldset, [role="radiogroup"]');
  if (box) return box;
  const price = [...document.querySelectorAll(
    'main product-price, main .product__price, main [id^="price-"], main .price, #MainContent .price'
  )].find((e) => shown(e) && !e.closest(`[data-cod-form], ${CARD}`));
  return price != null ? price : null;
}
function boot() {
  autoPlace();
  document.querySelectorAll("[data-cod-form]:not([data-cod-mounted])").forEach((el) => {
    var _a2, _b, _c, _d;
    el.dataset.codMounted = "1";
    if (el.dataset.cart === "true") {
      void mountCart(el);
      return;
    }
    if (/^\d+$/.test((_a2 = el.dataset.productId) != null ? _a2 : "")) el.dataset.productId = `gid://shopify/Product/${el.dataset.productId}`;
    if (/^\d+$/.test((_b = el.dataset.variantId) != null ? _b : "")) el.dataset.variantId = `gid://shopify/ProductVariant/${el.dataset.variantId}`;
    if (!/\d+$/.test((_c = el.dataset.variantId) != null ? _c : "") || !/\d+$/.test((_d = el.dataset.productId) != null ? _d : "")) {
      el.remove();
      return;
    }
    void mount({
      productId: el.dataset.productId,
      variantId: el.dataset.variantId,
      container: el
    });
  });
}
async function mountCart(el) {
  let lines;
  try {
    lines = await readCart();
  } catch {
    el.remove();
    return;
  }
  if (!lines.length) {
    el.style.display = "none";
    return;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const l of lines) {
    if (seen.has(l.productId)) continue;
    seen.add(l.productId);
    try {
      await api.config(l.productId, l.variantId);
    } catch {
      continue;
    }
    el.dataset.productId = l.productId;
    el.dataset.variantId = l.variantId;
    if (!el.isConnected) return;
    await mount({ productId: l.productId, variantId: l.variantId, container: el });
    return;
  }
  el.remove();
}
if (DIRECT == null ? void 0 : DIRECT.cartButton) {
  document.addEventListener("click", (e) => {
    var _a2, _b, _c, _d;
    const el = e.target;
    const cartBtn = (_a2 = el == null ? void 0 : el.closest) == null ? void 0 : _a2.call(el, CART_TRIGGERS);
    const rsiBtn = cartBtn ? null : (_b = el == null ? void 0 : el.closest) == null ? void 0 : _b.call(el, RELEASIT);
    if (!cartBtn && !rsiBtn || ((_c = el == null ? void 0 : el.closest) == null ? void 0 : _c.call(el, "[data-cod-modal]"))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.querySelector("[data-cod-modal]")) return;
    const fromCart = !!cartBtn || onCartPage() || overlayOpen() || cartOpen() || !!((_d = el == null ? void 0 : el.closest) == null ? void 0 : _d.call(el, '#pd-cart, .pd-panel, cart-drawer, cart-notification, [id*="CartDrawer"], [class*="cart-drawer"]'));
    if (fromCart || !openProductForm()) void openCartForm();
  }, true);
  if (/\/cart\/?$/.test(location.pathname) && /[?&](pd_)?cod=1\b/.test(location.search)) {
    window.setTimeout(() => void openCartForm(), 600);
  }
}
if (DIRECT) DIRECT.boot = boot;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
window.addEventListener("load", () => {
  autoPlace();
  boot();
  if (/[?&]cod_debug=1/.test(location.search)) setTimeout(showDebug, 2500);
});
function showDebug() {
  var _a2;
  const shown = (e) => e.getClientRects().length > 0;
  const desc = (e) => e ? `<${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}>` : "ninguno";
  const hosts = [...document.querySelectorAll("[data-cod-form]")];
  const marker = document.querySelector("[data-cod-autoplace]");
  const lines = [
    `Incrustación «COD Forms»: ${document.querySelector('[data-floating="true"], [data-cod-auto], [data-cod-autoplace]') ? "activa" : "NO activa o sin producto"}`,
    `Botón automático: ${document.querySelector("[data-cod-auto]") ? "puesto" : marker ? "sin sitio (no encontré «Agregar al carrito» ni el precio)" : "no pedido / quitado"}`,
    `Sitio elegido: ${desc(findBuyAnchor(((_a2 = marker == null ? void 0 : marker.dataset.variantId) != null ? _a2 : "").replace(/\D/g, "")))}`,
    `Formularios de compra del tema: ${document.querySelectorAll('form[action*="/cart/add"]').length}`,
    ...hosts.map((h, i) => {
      var _a3;
      return `#${i + 1} ${h.dataset.floating ? "flotante" : h.dataset.codAuto ? "automático" : "bloque manual"} · muestra: ${(_a3 = h.dataset.codRendered) != null ? _a3 : "nada"} · visible: ${shown(h) ? "sí" : "no"} · dentro de ${desc(h.parentElement)}`;
    })
  ];
  const box = document.createElement("pre");
  box.style.cssText = "position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;background:#111;color:#0f0;font:12px/1.4 monospace;padding:10px;border-radius:8px;white-space:pre-wrap;max-height:60vh;overflow:auto";
  box.textContent = "COD Forms — diagnóstico\n" + lines.join("\n");
  box.addEventListener("click", () => box.remove());
  document.body.appendChild(box);
  console.log(box.textContent);
}
let bootQueued = false;
const queueBoot = () => {
  if (bootQueued) return;
  bootQueued = true;
  requestAnimationFrame(() => {
    bootQueued = false;
    boot();
  });
};
new MutationObserver((muts) => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n instanceof HTMLElement && (n.matches("[data-cod-form]") || n.querySelector("[data-cod-form]"))) {
        queueBoot();
        return;
      }
      if ((DIRECT == null ? void 0 : DIRECT.cartButton) && n instanceof HTMLElement && (n.matches(CHECKOUT) || n.querySelector(CHECKOUT))) {
        queueBoot();
        return;
      }
      if ((DIRECT == null ? void 0 : DIRECT.cartButton) && n instanceof HTMLElement && onCartPage()) {
        queueBoot();
        return;
      }
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("shopify:section:load", queueBoot);
window.CodForm = { mount };
export {
  ANIMATION_SPEEDS as A,
  CSS as C,
  FormState as F,
  buttonShadow as a,
  buttonBackground as b,
  buttonIconSvg as c,
  buttonAnimationCss as d,
  marchSvg as e,
  CART_TRIGGERS as f,
  followPageVariant as g,
  mount as h,
  pageQuantity as i,
  pageQuantityInfo as j,
  pageVariant as k,
  money as m,
  provinceAllows as p,
  quote as q,
  renderForm as r,
  tokensToCss as t
};
