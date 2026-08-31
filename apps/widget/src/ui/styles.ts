/**
 * Estilos del widget. TODO sale de CSS custom properties, que a su vez vienen
 * de Theme.tokens en la base de datos. Cambiar colores, radios, tipografía o
 * animaciones desde el panel repinta el formulario sin un solo deploy.
 *
 * Vive dentro del Shadow DOM: no puede ensuciar el tema, ni el tema a él.
 */
export const CSS = `
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
