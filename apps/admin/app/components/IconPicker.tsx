import { BUTTON_ICONS, buttonIconSvg } from '@cod/contracts';

/**
 * Elegir el icono de un botón: «Sin icono» + los iconos del sistema.
 * value = nombre del icono, o '' para sin icono.
 */
export function IconPicker({ value, onChange, label }: { value: string; onChange: (name: string) => void; label: string }) {
  return (
    <div className="cod-icopick" role="radiogroup" aria-label={label}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button type="button" role="radio" aria-checked={!value} className={!value ? 'on' : ''} onClick={() => onChange('')}>
        <span className="cod-icopick-none">Sin icono</span>
      </button>
      {Object.entries(BUTTON_ICONS).map(([name, ic]) => (
        <button key={name} type="button" role="radio" aria-checked={value === name} aria-label={ic.label} title={ic.label}
          className={value === name ? 'on' : ''} onClick={() => onChange(name)}
          dangerouslySetInnerHTML={{ __html: buttonIconSvg(name) }} />
      ))}
    </div>
  );
}

const CSS = `
.cod-icopick{display:flex;flex-wrap:wrap;gap:6px}
.cod-icopick button{display:grid;place-items:center;min-width:42px;height:42px;padding:0 10px;border-radius:11px;cursor:pointer;
  border:1px solid var(--p-color-border,#D0D5DD);background:var(--p-color-bg-surface,#fff);color:var(--p-color-text,#344054);
  box-shadow:0 1px 2px rgba(16,24,40,.06);transition:box-shadow .15s ease,transform .12s ease}
.cod-icopick button:hover{box-shadow:0 4px 10px -4px rgba(16,24,40,.25)}
.cod-icopick button:active{transform:translateY(1px)}
.cod-icopick button svg{width:21px;height:21px}
.cod-icopick button.on{background:linear-gradient(180deg,#4A9DF8,#1A73E8);border-color:transparent;color:#fff;
  box-shadow:0 8px 18px -6px rgba(26,115,232,.55),inset 0 1px 0 rgba(255,255,255,.24)}
.cod-icopick-none{font:600 13px/1 Inter,-apple-system,sans-serif}
`;
