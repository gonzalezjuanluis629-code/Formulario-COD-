import { C as CSS, t as tokensToCss, F as FormState, r as renderForm } from "./index-CIBHaCia.js";
function renderPreview(host, fields, tokens) {
  var _a;
  host.textContent = "";
  const shadow = (_a = host.shadowRoot) != null ? _a : host.attachShadow({ mode: "open" });
  shadow.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = `:host{${tokensToCss(tokens)}}
${CSS}
${tokens.customCss}`;
  shadow.appendChild(style);
  const root = document.createElement("div");
  root.className = "cod-root";
  shadow.appendChild(root);
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
      showOrderSummaryToCustomer: false
    },
    offers: [],
    product: { variantId: "preview", title: "Producto de ejemplo", unitPriceCents: 189e3, image: null }
  };
  const state = new FormState(config);
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
export {
  renderPreview
};
