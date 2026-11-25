import { p as provinceAllows, A as ANIMATION_SPEEDS, m as money, e as marchSvg } from "./index-BBpmBHig.js";
function renderAddons(host, config, state, onChange) {
  var _a;
  const addons = config.addons.filter((a) => a.minCartCents <= config.product.unitPriceCents * state.qty && provinceAllows(a.provinces, state.province()));
  if (!addons.length) return;
  const downsells = addons.filter((a) => a.kind === "DOWNSELL");
  const wrap = document.createElement("div");
  wrap.className = "cod-addons";
  for (const a of addons) {
    if (a.kind === "ORDER_BUMP") wrap.appendChild(renderBump(a, state, onChange));
    else if (a.kind === "UPSELL") {
      wrap.appendChild(renderUpsell(a, (_a = downsells.find((d) => d.replacesId === a.id)) != null ? _a : null, state, onChange));
    }
  }
  host.appendChild(wrap);
}
function richTitle(a) {
  return esc(a.title).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\{precio\}/gi, `<b>${money(a.priceCents)}</b>`);
}
function cardStyle(a) {
  var _a;
  const st = a.style;
  const border = st.border === "none" ? "border:2px solid transparent" : `border:2px ${st.border} ${st.borderColor}`;
  return `${border};background:${st.bg};--card-color:${st.borderColor};--anim-speed:${ANIMATION_SPEEDS[(_a = st.animationSpeed) != null ? _a : "normal"]}`;
}
function clock(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function addTag(el, a) {
  var _a, _b;
  const text = ((_a = a.style.badgeText) != null ? _a : "").trim();
  const mins = (_b = a.style.badgeTimer) != null ? _b : 0;
  if (!text && !mins) return;
  el.classList.add("cod-has-tag");
  const tag = document.createElement("span");
  tag.className = `cod-tag cod-tag-${a.style.badgeSide === "left" ? "left" : "right"}`;
  tag.style.setProperty("--tag-bg", a.style.badgeColor || "#e11d48");
  tag.innerHTML = `${text ? `<span class="cod-tag-text">${esc(text)}</span>` : ""}${mins ? `<span class="cod-tag-clock" aria-live="off">${text ? "" : "Termina en "}<b></b></span>` : ""}`;
  el.appendChild(tag);
  if (!mins) return;
  const total = mins * 60;
  const key = `cod-tag-${a.id}`;
  let start = Date.now();
  try {
    const v = Number(localStorage.getItem(key));
    if (v > 0 && v <= Date.now()) start = v;
    else localStorage.setItem(key, String(start));
  } catch {
  }
  const out = tag.querySelector("b");
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
    out.textContent = clock(left);
  };
  tick();
  const timer = window.setInterval(() => {
    if (!el.isConnected) {
      window.clearInterval(timer);
      return;
    }
    tick();
  }, 1e3);
}
function animate(el, a) {
  var _a;
  const anim = (_a = a.style.animation) != null ? _a : "none";
  if (anim === "none") return;
  el.classList.add("cod-card", `cod-card-anim-${anim}`);
  if (anim !== "march") return;
  el.insertAdjacentHTML("afterbegin", marchSvg("cod-card"));
  requestAnimationFrame(() => {
    var _a2, _b;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
    (_a2 = el.querySelector(".cod-card-march rect")) == null ? void 0 : _a2.setAttribute("rx", String(Math.max(0, r - 1)));
    (_b = el.querySelector(".cod-card-march rect")) == null ? void 0 : _b.setAttribute("ry", String(Math.max(0, r - 1)));
  });
}
function priceTag(a, cls) {
  if (/\{precio\}/i.test(a.title) || !(a.priceCents > 0)) return "";
  return `<span class="${cls}">${a.compareAtCents ? `<s>${money(a.compareAtCents)}</s>` : ""}${money(a.priceCents)}</span>`;
}
function renderBump(a, state, onChange) {
  const el = document.createElement("label");
  el.className = "cod-bump";
  el.dataset.addonId = a.id;
  el.setAttribute("style", cardStyle(a));
  el.innerHTML = `
    <input type="checkbox">
    <span class="cod-bump-box"></span>
    <span class="cod-bump-text">
      <span class="cod-bump-title">${richTitle(a)}</span>
      ${a.description ? `<small>${esc(a.description)}</small>` : ""}
      ${priceTag(a, "cod-bump-price")}
    </span>
    ${a.image ? `<img class="cod-bump-img" src="${esc(a.image)}" alt="" loading="lazy">` : ""}`;
  animate(el, a);
  addTag(el, a);
  if (state.acceptedAddons.some((x) => x.id === a.id)) {
    el.querySelector("input").checked = true;
    el.classList.add("cod-bump-on");
  }
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
  el.dataset.addonId = a.id;
  el.setAttribute("style", cardStyle(a));
  el.innerHTML = `
    ${a.image ? `<img class="cod-upsell-img" src="${esc(a.image)}" alt="" loading="lazy">` : ""}
    <div class="cod-upsell-body">
      <span class="cod-bump-title">${richTitle(a)}</span>
      ${a.description ? `<small>${esc(a.description)}</small>` : ""}
      ${priceTag(a, "cod-upsell-price")}
    </div>
    <button type="button" class="cod-upsell-add">Añadir</button>`;
  animate(el, a);
  addTag(el, a);
  const btn = el.querySelector(".cod-upsell-add");
  let added = state.acceptedAddons.some((x) => x.id === a.id);
  if (added) {
    el.classList.add("cod-upsell-on");
    btn.textContent = "Quitar";
  }
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
