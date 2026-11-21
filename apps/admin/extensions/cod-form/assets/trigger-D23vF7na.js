import { A as ANIMATION_SPEEDS, b as buttonBackground, a as buttonShadow, c as buttonIconSvg, d as buttonAnimationCss } from "./index-guhD1p96.js";
function renderTrigger(host, cfg, onClick) {
  var _a;
  injectStylesOnce(host.getRootNode());
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `cod-trigger cod-trigger-anim-${cfg.animation}${cfg.depth ? " cod-depth" : ""}`;
  btn.style.cssText = [
    `--t-bg:${buttonBackground(cfg)}`,
    `--t-solid:${cfg.bg}`,
    `--t-shadow:${buttonShadow(cfg)}`,
    `--anim-speed:${ANIMATION_SPEEDS[(_a = cfg.animationSpeed) != null ? _a : "normal"]}`,
    `--t-color:${cfg.color}`,
    `--t-radius:${cfg.radius}px`,
    `height:${cfg.height}px`,
    cfg.width && cfg.width !== "auto" ? `width:${cfg.width}` : ""
  ].filter(Boolean).join(";");
  const icon = cfg.iconType === "image" && cfg.iconImageUrl ? `<img class="cod-trigger-img" src="${escapeAttr(cfg.iconImageUrl)}" alt="">` : cfg.iconType === "svg" && cfg.iconName ? `<span class="cod-trigger-emoji cod-ico">${buttonIconSvg(cfg.iconName, "cod-ico-svg")}</span>` : cfg.iconType === "emoji" ? `<span class="cod-trigger-emoji">${escapeHtml(cfg.icon)}</span>` : "";
  const descs = cfg.descriptions.filter((d) => d.trim());
  btn.innerHTML = `
    ${icon}
    <span class="cod-trigger-text">
      <span class="cod-trigger-title" style="font-size:${cfg.fontSize}px">${escapeHtml(cfg.text)}</span>
      ${descs.length ? `<span class="cod-trigger-descs" style="font-size:${cfg.descriptionFontSize}px">
             ${descs.map((d, i) => `<span class="cod-trigger-desc${i === 0 ? " on" : ""}">${escapeHtml(d)}</span>`).join("")}
           </span>` : ""}
    </span>`;
  btn.addEventListener("click", onClick);
  host.appendChild(btn);
  if (descs.length > 1) {
    const items = btn.querySelectorAll(".cod-trigger-desc");
    let i = 0;
    const timer = window.setInterval(() => {
      var _a2, _b;
      if (!btn.isConnected) {
        window.clearInterval(timer);
        return;
      }
      (_a2 = items[i]) == null ? void 0 : _a2.classList.remove("on");
      i = (i + 1) % items.length;
      (_b = items[i]) == null ? void 0 : _b.classList.add("on");
    }, cfg.descriptionIntervalMs);
  }
}
const styledRoots = /* @__PURE__ */ new WeakSet();
function injectStylesOnce(root) {
  const target = root instanceof ShadowRoot ? root : document;
  if (styledRoots.has(target)) return;
  styledRoots.add(target);
  const style = document.createElement("style");
  style.textContent = `
    .cod-trigger.cod-depth{box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -1px 0 rgba(0,0,0,.10)}
    .cod-trigger.cod-depth:active{transform:translateY(1px) scale(.99)!important}
    .cod-trigger{display:inline-flex;align-items:center;justify-content:center;gap:10px;
      box-sizing:border-box;max-width:100%;padding:0 26px;background:var(--t-bg);color:var(--t-color);border:0;
      border-radius:var(--t-radius);font-family:inherit;font-weight:700;cursor:pointer;line-height:1.15;
      text-align:center;overflow:hidden;filter:var(--t-shadow,none);
      transition:transform .12s cubic-bezier(.32,.72,0,1),filter .2s;-webkit-tap-highlight-color:transparent}
    .cod-trigger:hover{filter:var(--t-shadow,none) brightness(1.08)}
    .cod-trigger:active{transform:scale(.97)}
    .cod-trigger-emoji{font-size:1.15em;line-height:1}
    .cod-ico{display:inline-flex}.cod-ico-svg{width:1.25em;height:1.25em;display:block}
    .cod-trigger-img{width:1.4em;height:1.4em;object-fit:contain;border-radius:4px}
    .cod-trigger-text{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0}
    .cod-trigger-title{font-weight:700}
    /* Las frases se apilan en la misma celda: el contenedor mide lo que la más larga. */
    .cod-trigger-descs{display:grid;font-weight:500;opacity:.92}
    .cod-trigger-desc{grid-area:1/1;white-space:nowrap;opacity:0;transform:translateY(55%);
      transition:opacity .4s cubic-bezier(.32,.72,0,1),transform .4s cubic-bezier(.32,.72,0,1)}
    .cod-trigger-desc.on{opacity:1;transform:translateY(0)}

    ${buttonAnimationCss("cod-trigger", "var(--t-solid)")}
  `;
  if (target instanceof ShadowRoot) target.appendChild(style);
  else document.head.appendChild(style);
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const escapeAttr = (s) => escapeHtml(s).replace(/`/g, "");
export {
  renderTrigger
};
