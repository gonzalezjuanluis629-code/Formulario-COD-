import { b as buttonBackground } from "./index-KHX-EjvW.js";
function renderTrigger(host, cfg, onClick) {
  injectStylesOnce();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `cod-trigger cod-trigger-anim-${cfg.animation}`;
  btn.style.cssText = [
    `--t-bg:${buttonBackground(cfg)}`,
    `--t-solid:${cfg.bg}`,
    `--t-color:${cfg.color}`,
    `--t-radius:${cfg.radius}px`,
    `height:${cfg.height}px`,
    cfg.width && cfg.width !== "auto" ? `width:${cfg.width}` : ""
  ].filter(Boolean).join(";");
  const icon = cfg.iconType === "image" && cfg.iconImageUrl ? `<img class="cod-trigger-img" src="${escapeAttr(cfg.iconImageUrl)}" alt="">` : cfg.iconType === "emoji" ? `<span class="cod-trigger-emoji">${escapeHtml(cfg.icon)}</span>` : "";
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
      var _a, _b;
      if (!btn.isConnected) {
        window.clearInterval(timer);
        return;
      }
      (_a = items[i]) == null ? void 0 : _a.classList.remove("on");
      i = (i + 1) % items.length;
      (_b = items[i]) == null ? void 0 : _b.classList.add("on");
    }, cfg.descriptionIntervalMs);
  }
}
let stylesInjected = false;
function injectStylesOnce() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .cod-trigger{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;
      box-sizing:border-box;max-width:100%;padding:0 26px;background:var(--t-bg);color:var(--t-color);border:0;
      border-radius:var(--t-radius);font-family:inherit;font-weight:700;cursor:pointer;line-height:1.15;
      text-align:center;overflow:hidden;
      transition:transform .12s cubic-bezier(.32,.72,0,1),filter .2s;-webkit-tap-highlight-color:transparent}
    .cod-trigger:hover{filter:brightness(1.08)}
    .cod-trigger:active{transform:scale(.97)}
    .cod-trigger-emoji{font-size:1.15em;line-height:1}
    .cod-trigger-img{width:1.4em;height:1.4em;object-fit:contain;border-radius:4px}
    .cod-trigger-text{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0}
    .cod-trigger-title{font-weight:700}
    /* Las frases se apilan en la misma celda: el contenedor mide lo que la más larga. */
    .cod-trigger-descs{display:grid;font-weight:500;opacity:.92}
    .cod-trigger-desc{grid-area:1/1;white-space:nowrap;opacity:0;transform:translateY(55%);
      transition:opacity .4s cubic-bezier(.32,.72,0,1),transform .4s cubic-bezier(.32,.72,0,1)}
    .cod-trigger-desc.on{opacity:1;transform:translateY(0)}

    .cod-trigger-anim-pulse{animation:cod-trig-pulse 1.6s ease-in-out infinite}
    @keyframes cod-trig-pulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(0,0,0,.28)}
      50%{transform:scale(1.045);box-shadow:0 0 0 10px rgba(0,0,0,0)}}
    .cod-trigger-anim-bounce{animation:cod-trig-bounce 1.4s cubic-bezier(.28,.84,.42,1) infinite}
    @keyframes cod-trig-bounce{0%,55%,100%{transform:translateY(0)}25%{transform:translateY(-8px)}40%{transform:translateY(0)}47%{transform:translateY(-3px)}}
    .cod-trigger-anim-shake{animation:cod-trig-shake 2.6s ease-in-out infinite}
    @keyframes cod-trig-shake{0%,70%,100%{transform:rotate(0)}74%{transform:rotate(-4deg)}78%{transform:rotate(4deg)}
      82%{transform:rotate(-3deg)}86%{transform:rotate(3deg)}90%{transform:rotate(-1deg)}94%{transform:rotate(1deg)}}
    .cod-trigger-anim-shine::after{content:"";position:absolute;inset:0;pointer-events:none;
      background:linear-gradient(110deg,transparent 25%,rgba(255,255,255,.55) 50%,transparent 75%);
      transform:translateX(-100%);animation:cod-trig-shine 2.4s ease-in-out infinite}
    @keyframes cod-trig-shine{0%,50%{transform:translateX(-100%)}100%{transform:translateX(100%)}}

    @media(prefers-reduced-motion:reduce){.cod-trigger,.cod-trigger *,.cod-trigger::after{animation:none!important}}
  `;
  document.head.appendChild(style);
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const escapeAttr = (s) => escapeHtml(s).replace(/`/g, "");
export {
  renderTrigger
};
