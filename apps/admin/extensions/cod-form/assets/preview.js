import { C as CSS, t as tokensToCss, F as FormState, q as quote, r as renderForm } from "./index-CCgsoCAs.js";
import { renderTrigger } from "./trigger-5lHK5Vd5.js";
let lastSelected = null;
let lastFormKey = "";
let lastTriggerKey = "";
let currentOnSelect;
const PREVIEW_CSS = `
.cod-field{position:relative;cursor:pointer;border-radius:8px;transition:box-shadow .15s}
.cod-field:hover{box-shadow:0 0 0 2px rgba(0,91,211,.25)}
.cod-field.cod-selected{box-shadow:0 0 0 2px #005bd3}
.cod-field.cod-selected.cod-hidden{display:block;opacity:.6}
.cod-static .cod-field{animation:none}
.cod-field.cod-selected::before{content:attr(data-label);position:absolute;top:-9px;right:6px;z-index:2;
  background:#005bd3;color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px}`;
function renderPreview(host, fields, tokens, opts = {}) {
  var _a, _b;
  currentOnSelect = opts.onSelect;
  renderTriggerPreview(host, tokens, !!opts.showTrigger);
  const firstTime = !host.shadowRoot;
  const shadow = (_a = host.shadowRoot) != null ? _a : host.attachShadow({ mode: "open" });
  if (firstTime) {
    host.textContent = "";
    shadow.appendChild(document.createElement("style"));
    shadow.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".cod-field[data-key]");
      if (el) currentOnSelect == null ? void 0 : currentOnSelect(el.dataset.key);
    });
  }
  const style = shadow.querySelector("style");
  const css = `:host{${tokensToCss(tokens)}}
${CSS}
${tokens.customCss}
${PREVIEW_CSS}`;
  if (style.textContent !== css) style.textContent = css;
  const formKey = JSON.stringify([
    fields,
    tokens.progressBar,
    tokens.submit.text,
    tokens.submit.iconType,
    tokens.submit.icon,
    tokens.submit.priceDisplay
  ]);
  let root = shadow.querySelector(".cod-root");
  if (formKey !== lastFormKey || !root) {
    lastFormKey = formKey;
    const next = document.createElement("div");
    next.className = root ? "cod-root cod-static" : "cod-root";
    buildForm(next, fields, tokens);
    if (root) shadow.replaceChild(next, root);
    else shadow.appendChild(next);
    root = next;
  }
  const btn = root.querySelector(".cod-submit");
  if (btn) {
    const cls = `cod-submit-anim-${tokens.submit.animation}`;
    if (!btn.classList.contains(cls)) {
      btn.className = btn.className.replace(/\bcod-submit-anim-\S+/g, "").trim() + " " + cls;
    }
  }
  markSelection(root, fields, (_b = opts.selectedKey) != null ? _b : null);
}
function buildForm(root, fields, tokens) {
  const config = {
    formId: "preview",
    formVersionId: "preview",
    fields,
    tokens,
    location: {
      enabled: true,
      gpsEnabled: true,
      manualEnabled: true,
      requireLocation: false,
      lockAfterCapture: true,
      defaultCenter: { lat: 18.4861, lng: -69.9312 },
      defaultZoom: 17,
      gpsLabel: "Usar mi ubicación actual",
      gpsHint: "Tomada del mapa, precisa",
      manualLabel: "Escribirla",
      manualHint: "La escribes tú mismo"
    },
    settings: {
      thankYouUrl: "/pages/gracias",
      redirectDelayMs: 3e3,
      orderTag: "COD",
      gateway: "Cash on Delivery (COD)",
      currency: "DOP",
      freeShippingOverCents: 35e4,
      defaultShippingCents: 25e3,
      shippingByProvince: {},
      codFeeCents: 0,
      codFeeLabel: "Recargo contra entrega",
      showOrderSummaryToCustomer: false,
      confirmation: {
        title: "¡Pedido confirmado!",
        message: "Te contactamos por WhatsApp para coordinar la entrega.",
        redirectTarget: "none",
        whatsapp: { enabled: false, phone: "", messageTemplate: "" }
      },
      antifraud: {
        holdHighRisk: false,
        riskThreshold: 50,
        maxOrdersPerPhonePerDay: 0,
        turnstileSiteKey: "",
        turnstileSecret: ""
      },
      tracking: {
        metaPixelId: "",
        metaCapiToken: "",
        metaTestCode: "",
        tiktokPixelId: "",
        tiktokToken: "",
        ga4MeasurementId: "",
        ga4ApiSecret: "",
        purchaseEventName: "Purchase"
      }
    },
    offers: [],
    addons: [],
    product: { variantId: "preview", title: "Producto de ejemplo", unitPriceCents: 189e3, image: null }
  };
  const state = new FormState(config);
  state.quoter = async (r) => quote({
    qty: r.qty,
    unitPriceCents: config.product.unitPriceCents,
    currency: config.settings.currency,
    offers: config.offers,
    defaultShippingCents: config.settings.defaultShippingCents,
    freeShippingOverCents: config.settings.freeShippingOverCents,
    codFeeCents: 0,
    discount: r.discountCode ? { code: r.discountCode.toUpperCase(), source: "APP", label: "Ejemplo", kind: "PERCENTAGE", valueBps: 1e3 } : null
  });
  renderForm(root, config, state, {
    onSubmit: () => {
      root.innerHTML = `
        <div class="cod-done">
          <div class="cod-done-tick">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"
                 stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3>¡Pedido confirmado!</h3>
          <p>Te contactamos por WhatsApp para coordinar la entrega.</p>
          <div class="cod-done-bar"><span style="animation-duration:3000ms"></span></div>
          <small>Vista previa — sin resumen, tal como lo verá el cliente</small>
        </div>`;
    }
  });
}
function markSelection(root, fields, selectedKey) {
  var _a;
  const names = new Map(fields.map((f) => [f.key, f.label || f.content || f.key]));
  root.querySelectorAll(".cod-field[data-key]").forEach((el) => {
    var _a2;
    el.dataset.label = ((_a2 = names.get(el.dataset.key)) != null ? _a2 : "").slice(0, 40);
    el.classList.toggle("cod-selected", el.dataset.key === selectedKey);
  });
  if (selectedKey && selectedKey !== lastSelected) {
    (_a = root.querySelector(".cod-selected")) == null ? void 0 : _a.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  lastSelected = selectedKey;
}
function renderTriggerPreview(host, tokens, show) {
  var _a;
  let box = document.getElementById("cod-trigger-preview");
  if (!show) {
    box == null ? void 0 : box.remove();
    lastTriggerKey = "";
    return;
  }
  const key = JSON.stringify(tokens.trigger);
  if (box && key === lastTriggerKey) return;
  lastTriggerKey = key;
  if (!box) {
    box = document.createElement("div");
    box.id = "cod-trigger-preview";
    box.style.cssText = "margin:0 auto 16px;max-width:420px";
    (_a = host.parentElement) == null ? void 0 : _a.insertBefore(box, host);
  }
  box.innerHTML = '<div style="font:600 11px system-ui;color:#8a8a8a;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">Botón «Comprar ahora»</div>';
  const slot = document.createElement("div");
  box.appendChild(slot);
  renderTrigger(slot, tokens.trigger, () => void 0);
}
export {
  renderPreview
};
