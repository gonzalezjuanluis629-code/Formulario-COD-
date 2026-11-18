/** Cómo aparece el formulario: desde abajo, ventana flotante o página completa (con dibujito). */
export type DisplayMode = 'sheet' | 'popup' | 'page';

const OPTIONS: { v: DisplayMode; title: string; text: string }[] = [
  { v: 'sheet', title: 'Desde abajo', text: 'Sube desde abajo de la pantalla' },
  { v: 'popup', title: 'Ventana flotante', text: 'Aparece en el centro, flotando' },
  { v: 'page', title: 'Página completa', text: 'Ocupa toda la pantalla' },
];

export function DisplayPicker({ value, onChange }: { value: DisplayMode; onChange: (v: DisplayMode) => void }) {
  return (
    <div className="cod-dpick" role="radiogroup" aria-label="Cómo aparece el formulario">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {OPTIONS.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          <span className={`cod-dpick-phone m-${o.v}`} aria-hidden><i /></span>
          <b>{o.title}</b>
          <small>{o.text}</small>
        </button>
      ))}
    </div>
  );
}

const CSS = `
.cod-dpick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.cod-dpick button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px 10px;border-radius:14px;cursor:pointer;text-align:center;
  border:1.5px solid var(--p-color-border,#E3E7ED);background:var(--p-color-bg-surface,#fff);color:var(--p-color-text,#0A1120);font:inherit;
  box-shadow:0 1px 2px rgba(16,24,40,.06),0 3px 8px -3px rgba(16,24,40,.10);transition:box-shadow .15s ease,transform .12s ease}
.cod-dpick button:hover{box-shadow:0 2px 4px rgba(16,24,40,.06),0 8px 16px -6px rgba(16,24,40,.18)}
.cod-dpick button:active{transform:translateY(1px)}
.cod-dpick button.on{border-color:#0B0D10;box-shadow:0 0 0 3px rgba(0,0,0,.1),0 8px 18px -8px rgba(0,0,0,.35)}
html.cod-dark .cod-dpick button.on{border-color:#FFFFFF;box-shadow:0 0 0 3px rgba(255,255,255,.14),0 8px 18px -8px rgba(0,0,0,.6)}
.cod-dpick b{font-size:14px;font-weight:800}
.cod-dpick small{font-size:12px;line-height:1.3;color:var(--p-color-text-secondary,#667085)}
.cod-dpick-phone{position:relative;width:46px;height:78px;border-radius:9px;border:2px solid currentColor;opacity:.85;margin-bottom:4px;overflow:hidden;
  background:repeating-linear-gradient(180deg,transparent 0 8px,rgba(127,127,127,.18) 8px 10px)}
.cod-dpick-phone i{position:absolute;background:#1A73E8;opacity:.9}
.m-sheet i{left:0;right:0;bottom:0;height:58%;border-radius:7px 7px 0 0}
.m-popup i{left:6px;right:6px;top:22%;height:56%;border-radius:6px;box-shadow:0 0 0 30px rgba(0,0,0,.25)}
.m-page i{inset:0}
.cod-dpick button.on .cod-dpick-phone{color:#1A73E8;opacity:1}
`;
