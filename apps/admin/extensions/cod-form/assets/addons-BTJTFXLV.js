const money = (cents, currency = "DOP") => `${currency === "DOP" ? "RD$" : currency} ${(cents / 100).toLocaleString("en-US")}`;
function renderAddons(host, config, state, onChange) {
  var _a;
  const addons = config.addons.filter((a) => a.minCartCents <= config.product.unitPriceCents * state.qty);
  if (!addons.length) return;
  const bumps = addons.filter((a) => a.kind === "ORDER_BUMP");
  const upsells = addons.filter((a) => a.kind === "UPSELL");
  const downsells = addons.filter((a) => a.kind === "DOWNSELL");
  const wrap = document.createElement("div");
  wrap.className = "cod-addons";
  for (const b of bumps) wrap.appendChild(renderBump(b, state, onChange));
  for (const u of upsells) {
    wrap.appendChild(renderUpsell(u, (_a = downsells.find((d) => d.replacesId === u.id)) != null ? _a : null, state, onChange));
  }
  host.appendChild(wrap);
}
function renderBump(a, state, onChange) {
  const el = document.createElement("label");
  el.className = "cod-bump";
  el.innerHTML = `
    <input type="checkbox">
    <span class="cod-bump-box"></span>
    ${a.image ? `<img class="cod-bump-img" src="${esc(a.image)}" alt="">` : ""}
    <span class="cod-bump-text">
      <b>${esc(a.title)}</b>
      ${a.description ? `<small>${esc(a.description)}</small>` : ""}
    </span>
    <span class="cod-bump-price">
      ${a.compareAtCents ? `<s>${money(a.compareAtCents)}</s>` : ""}
      ${money(a.priceCents)}
    </span>`;
  el.querySelector("input").addEventListener("change", (e) => {
    toggleAddon(state, a, e.target.checked);
    el.classList.toggle("cod-bump-on", e.target.checked);
    onChange();
  });
  return el;
}
function renderUpsell(a, downsell, state, onChange) {
  const el = document.createElement("div");
  el.className = "cod-upsell";
  el.innerHTML = `
    ${a.image ? `<img class="cod-upsell-img" src="${esc(a.image)}" alt="">` : ""}
    <div class="cod-upsell-body">
      <b>${esc(a.title)}</b>
      ${a.description ? `<small>${esc(a.description)}</small>` : ""}
      <span class="cod-upsell-price">
        ${a.compareAtCents ? `<s>${money(a.compareAtCents)}</s>` : ""}
        ${money(a.priceCents)}
      </span>
    </div>
    <button type="button" class="cod-upsell-add">Añadir</button>`;
  const btn = el.querySelector(".cod-upsell-add");
  let added = false;
  let downsellShown = false;
  btn.addEventListener("click", () => {
    added = !added;
    toggleAddon(state, a, added);
    el.classList.toggle("cod-upsell-on", added);
    btn.textContent = added ? "Quitar" : "Añadir";
    if (!added && downsell && !downsellShown) {
      downsellShown = true;
      el.insertAdjacentElement("afterend", renderUpsell(downsell, null, state, onChange));
    }
    onChange();
  });
  return el;
}
function toggleAddon(state, a, on) {
  if (on) {
    if (!state.acceptedAddons.some((x) => x.id === a.id)) {
      state.acceptedAddons.push({ id: a.id, variantId: a.variantId, qty: a.qty });
    }
  } else {
    state.acceptedAddons = state.acceptedAddons.filter((x) => x.id !== a.id);
  }
}
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export {
  renderAddons
};
