/**
 * Diseño de Figui para TODAS las secciones del editor (dentro de Figui).
 * Pone encima de Polaris el aspecto de Figui: letra Inter, tarjetas redondeadas
 * con sombra suave, botones con profundidad (grafito, verde para guardar, suaves), pestañas
 * tipo píldora y campos redondeados. Funciona en claro y en oscuro.
 */
export const FIGUI_SKIN = `
html.cod-figui{
  /* Sin tanto azul: lo elegido en grafito, la acción principal en verde. */
  --fg-sel-grad:linear-gradient(180deg,#3B4252 0%,#1F242E 100%);
  --fg-sel-glow:0 8px 16px -8px rgba(17,24,39,.55),0 2px 4px rgba(17,24,39,.14),inset 0 1px 0 rgba(255,255,255,.14);
  --fg-sel-ink:#fff;
  --fg-go-grad:linear-gradient(180deg,#34D07A 0%,#16A34A 100%);
  --fg-go-glow:0 8px 18px -6px rgba(22,163,74,.55),0 2px 4px rgba(22,163,74,.18),inset 0 1px 0 rgba(255,255,255,.26);
  --fg-go-glow-hover:0 12px 24px -6px rgba(22,163,74,.6),0 3px 6px rgba(22,163,74,.2),inset 0 1px 0 rgba(255,255,255,.28);
  --fg-focus:#6B7280;--fg-focus-ring:rgba(107,114,128,.2);--fg-hover-line:#C9CED6;
  --fg-red-grad:linear-gradient(180deg,#E5545A 0%,#C92F33 100%);
  --fg-red-glow:0 8px 18px -6px rgba(201,47,51,.5),0 2px 4px rgba(201,47,51,.16),inset 0 1px 0 rgba(255,255,255,.22);
  --fg-soft-grad:linear-gradient(180deg,#FFFFFF 0%,#F6F8FB 100%);
  --fg-soft-shadow:0 1px 2px rgba(16,24,40,.06),0 3px 8px -3px rgba(16,24,40,.10),inset 0 1px 0 #fff;
  --fg-soft-shadow-hover:0 2px 4px rgba(16,24,40,.06),0 8px 16px -6px rgba(16,24,40,.14),inset 0 1px 0 #fff;
  --fg-card-shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px -12px rgba(16,24,40,.14);
  --fg-line:#E3E7ED;--fg-ink:#0A1120;--fg-muted:#667085;--fg-page:#F2F4F8;--fg-card:#FFFFFF;--fg-input:#FFFFFF;--fg-input-line:#D0D5DD;
  --p-font-family-sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --p-color-bg:#F2F4F8;
  --p-color-bg-fill-brand:#1F242E;--p-color-bg-fill-brand-hover:#2B313C;--p-color-bg-fill-brand-active:#111827;--p-color-bg-fill-brand-selected:#1F242E;
  --p-color-border-focus:#6B7280;--p-color-border-emphasis:#1F242E;
  --p-color-bg-surface-info:#F1F7F6;--p-color-bg-fill-info:#CDEBE5;--p-color-bg-fill-info-secondary:#CDEBE5;--p-color-icon-info:#0F766E;--p-color-text-info:#0F5F59;--p-color-border-info:#B7DDD6;
  --p-border-radius-200:10px;--p-border-radius-300:14px;--p-border-radius-400:18px;
  --p-font-size-275:12.5px;--p-font-size-300:13px;--p-font-size-325:14.5px;--p-font-size-350:15.5px;--p-font-size-400:17px;--p-font-size-500:20px;--p-font-size-600:24px;
  --p-font-line-height-400:20px;--p-font-line-height-500:22px;--p-font-line-height-600:26px;
  background:var(--fg-page)}
html.cod-figui.cod-dark{
  --fg-soft-grad:linear-gradient(180deg,#2a2f37 0%,#22262d 100%);
  --fg-soft-shadow:0 1px 2px rgba(0,0,0,.35),0 3px 8px -3px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);
  --fg-soft-shadow-hover:0 2px 4px rgba(0,0,0,.4),0 8px 16px -6px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);
  --fg-card-shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -12px rgba(0,0,0,.6);
  --fg-line:#2f333a;--fg-ink:#e4e8ef;--fg-muted:#9fa5ae;--fg-page:#10141a;--fg-card:#1a1e25;--fg-input:#10141a;--fg-input-line:#3a3f48;
  --fg-sel-grad:linear-gradient(180deg,#F4F5F7 0%,#D5D9DF 100%);--fg-sel-glow:0 8px 16px -8px rgba(0,0,0,.6),inset 0 1px 0 #fff;--fg-sel-ink:#111827;
  --fg-focus:#9CA3AF;--fg-focus-ring:rgba(156,163,175,.22);--fg-hover-line:#4a505a;
  --p-color-bg-fill-brand:#E4E8EF;--p-color-border-emphasis:#E4E8EF;
  --p-color-bg:#10141a}
html.cod-figui body{background:var(--fg-page);font-family:var(--p-font-family-sans);-webkit-font-smoothing:antialiased}

/* Tarjetas */
html.cod-figui .Polaris-ShadowBevel{--pc-shadow-bevel-border-radius-xs:18px!important;box-shadow:var(--fg-card-shadow)!important;border-radius:18px}
html.cod-figui .Polaris-ShadowBevel::before{display:none}
html.cod-figui .Polaris-ShadowBevel>.Polaris-Box{border:1px solid var(--fg-line);border-radius:18px}
html.cod-figui .Polaris-Text--headingLg,html.cod-figui .Polaris-Text--headingXl{font-weight:800;letter-spacing:-.01em}
html.cod-figui .Polaris-Text--headingMd,html.cod-figui .Polaris-Text--headingSm{font-weight:750}

/* Botones */
html.cod-figui .Polaris-Button{border-radius:11px!important;transition:box-shadow .15s ease,transform .12s ease,filter .15s ease}
html.cod-figui .Polaris-Button::before,html.cod-figui .Polaris-Button::after{display:none!important}
html.cod-figui .Polaris-Button:active:not(.Polaris-Button--disabled){transform:translateY(1px)}
html.cod-figui .Polaris-Button--variantPrimary:not(.Polaris-Button--disabled){background:var(--fg-go-grad)!important;color:#fff!important;box-shadow:var(--fg-go-glow)!important;border:0!important}
html.cod-figui .Polaris-Button--variantPrimary:not(.Polaris-Button--disabled):hover{box-shadow:var(--fg-go-glow-hover)!important;filter:brightness(1.04)}
html.cod-figui .Polaris-Button--variantPrimary .Polaris-Icon__Svg{fill:#fff}
html.cod-figui .Polaris-Button--variantPrimary.Polaris-Button--toneCritical:not(.Polaris-Button--disabled){background:var(--fg-red-grad)!important;box-shadow:var(--fg-red-glow)!important}
html.cod-figui .Polaris-Button--variantPrimary.Polaris-Button--disabled{background:var(--fg-soft-grad)!important;color:var(--fg-muted)!important;box-shadow:var(--fg-soft-shadow)!important;border:1px solid var(--fg-line)!important}
html.cod-figui .Polaris-Button--variantSecondary{background:var(--fg-soft-grad)!important;color:var(--fg-ink)!important;box-shadow:var(--fg-soft-shadow)!important;border:1px solid var(--fg-line)!important}
html.cod-figui .Polaris-Button--variantSecondary:hover:not(.Polaris-Button--disabled){box-shadow:var(--fg-soft-shadow-hover)!important;border-color:var(--fg-hover-line)!important}
html.cod-figui .Polaris-Button--variantSecondary.Polaris-Button--toneCritical{color:#D92D20!important}
html.cod-figui .Polaris-Button--pressed,html.cod-figui .Polaris-Button[aria-pressed="true"]{background:var(--fg-sel-grad)!important;color:var(--fg-sel-ink)!important;box-shadow:var(--fg-sel-glow)!important;border-color:transparent!important}
html.cod-figui .Polaris-Button--pressed .Polaris-Icon__Svg,html.cod-figui .Polaris-Button[aria-pressed="true"] .Polaris-Icon__Svg{fill:var(--fg-sel-ink)}
html.cod-figui .Polaris-Button--variantPlain:not(.Polaris-Button--toneCritical),html.cod-figui .Polaris-Button--variantTertiary:not(.Polaris-Button--toneCritical){color:#0F766E}
html.cod-figui.cod-dark .Polaris-Button--variantPlain:not(.Polaris-Button--toneCritical){color:#5EEAD4}
html.cod-figui .Polaris-ButtonGroup--variantSegmented{gap:6px;padding:4px;border-radius:13px;background:var(--fg-page);box-shadow:inset 0 1px 2px rgba(16,24,40,.08)}
html.cod-figui .Polaris-ButtonGroup--variantSegmented .Polaris-Button{border-radius:9px!important}
html.cod-figui .Polaris-ButtonGroup--variantSegmented .Polaris-Button--variantSecondary:not(.Polaris-Button--pressed){background:transparent!important;box-shadow:none!important;border-color:transparent!important;color:var(--fg-muted)!important}

/* Pestañas (Polaris Tabs) como píldoras */
html.cod-figui .Polaris-Tabs__Wrapper{border:0!important;padding:4px;gap:4px}
html.cod-figui .Polaris-Tabs__Tab{border-radius:10px!important;font-weight:650}
html.cod-figui .Polaris-Tabs__Tab .Polaris-Text--root{color:var(--fg-muted)}
html.cod-figui .Polaris-Tabs__Tab--active,html.cod-figui .Polaris-Tabs__Tab[aria-selected="true"]{background:var(--fg-sel-grad)!important;box-shadow:var(--fg-sel-glow)}
html.cod-figui .Polaris-Tabs__Tab--active .Polaris-Text--root,html.cod-figui .Polaris-Tabs__Tab[aria-selected="true"] .Polaris-Text--root{color:var(--fg-sel-ink)!important}

/* Campos */
html.cod-figui .Polaris-TextField__Backdrop,html.cod-figui .Polaris-Select__Backdrop{border-radius:11px!important;border:1px solid var(--fg-input-line)!important;background:var(--fg-input)!important;box-shadow:inset 0 1px 2px rgba(16,24,40,.05)}
html.cod-figui .Polaris-TextField--focus>.Polaris-TextField__Backdrop,html.cod-figui .Polaris-TextField__Input:focus~.Polaris-TextField__Backdrop{border-color:var(--fg-focus)!important;box-shadow:0 0 0 3px var(--fg-focus-ring)!important}
html.cod-figui .Polaris-TextField__Backdrop::after,html.cod-figui .Polaris-Select__Backdrop::after{border-radius:13px!important}
html.cod-figui .Polaris-Checkbox__Backdrop{border-radius:6px!important}
html.cod-figui .Polaris-Checkbox__Input:checked+.Polaris-Checkbox__Backdrop{background:var(--fg-go-grad)!important;border-color:transparent!important}
html.cod-figui .Polaris-RadioButton__Input:checked+.Polaris-RadioButton__Backdrop{border-color:#1F242E!important;background:#1F242E!important}
html.cod-figui.cod-dark .Polaris-RadioButton__Input:checked+.Polaris-RadioButton__Backdrop{border-color:#E4E8EF!important;background:#E4E8EF!important}

/* Avisos, etiquetas y tablas */
html.cod-figui .Polaris-Banner{border-radius:14px!important}
html.cod-figui .Polaris-Badge{border-radius:999px!important;font-weight:650}
html.cod-figui .Polaris-IndexTable__TableHeading,html.cod-figui .Polaris-DataTable__Cell--header{font-weight:700;color:var(--fg-muted)}
html.cod-figui .Polaris-IndexTable__TableRow:hover{background:rgba(17,24,39,.03)}
html.cod-figui .Polaris-RangeSlider-SingleThumb__Input::-webkit-slider-thumb{background:#1F242E!important}

/* Más aire y letras más claras en todas las secciones */
html.cod-figui .Polaris-Page{padding-top:10px}
html.cod-figui .Polaris-Page-Header__TitleWrapper h1,html.cod-figui .Polaris-Header-Title{font-size:24px!important;font-weight:800!important;letter-spacing:-.015em}
html.cod-figui .Polaris-ShadowBevel>.Polaris-Box{padding:18px!important}
html.cod-figui .Polaris-ShadowBevel .Polaris-Text--headingSm,html.cod-figui .Polaris-ShadowBevel .Polaris-Text--headingMd{font-size:16.5px;font-weight:800}
html.cod-figui .Polaris-IndexTable__TableCell{padding-top:12px!important;padding-bottom:12px!important}
html.cod-figui .Polaris-Labelled__LabelWrapper .Polaris-Label__Text,html.cod-figui .Polaris-Label{font-weight:650}
html.cod-figui .Polaris-TextField__Input,html.cod-figui .Polaris-Select__Input{min-height:42px;font-size:15px!important}
html.cod-figui .Polaris-Button--sizeMedium{min-height:38px;padding-inline:14px!important;font-weight:650}
html.cod-figui .Polaris-Button--sizeSlim{min-height:32px}
/* Encabezados propios de cada sección (cod-head) */
html.cod-figui .cod-head h1,html.cod-figui .Polaris-Page-Header h1{font-size:24px;font-weight:800;letter-spacing:-.015em}
`;
