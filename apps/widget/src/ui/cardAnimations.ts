/**
 * Animaciones de las tarjetas de extras (casilla «Agrega…» y botón «Añadir»).
 *
 * Una sola definición para la tienda, la vista previa y el selector del panel.
 * Reglas:
 * - Llaman la atención con pausas, y se detienen cuando el cliente ya lo marcó.
 * - Solo transform / opacity / box-shadow / stroke → fluidas en móviles.
 * - --anim-speed ajusta la velocidad (1 = normal) y --card-color es el color
 *   del borde de la tarjeta.
 * - Respetan «reducir movimiento» del sistema.
 */

export const CARD_ANIMATIONS = [
  { id: 'none', label: 'Ninguna' },
  { id: 'march', label: 'Borde en movimiento' },
  { id: 'shine', label: 'Brillo' },
  { id: 'pulse', label: 'Latido' },
  { id: 'glow', label: 'Resplandor' },
  { id: 'shake', label: 'Sacudida' },
] as const;

export type CardAnimation = (typeof CARD_ANIMATIONS)[number]['id'];

/** Borde que camina: rayas dibujadas con SVG (respetan las esquinas redondeadas). */
export function marchSvg(cls: string, rx = 12): string {
  return `<svg class="${cls}-march" aria-hidden="true" focusable="false"><rect x="0" y="0" width="100%" height="100%" rx="${rx}" ry="${rx}"/></svg>`;
}

/**
 * @param cls   clase base de la tarjeta, p. ej. "cod-card"
 * @param done  selector de la tarjeta ya elegida (la animación se detiene)
 */
export function cardAnimationCss(cls: string, done = '.cod-bump-on,.cod-upsell-on'): string {
  const a = (n: string) => `.${cls}.${cls}-anim-${n}`;
  const k = (n: string) => `${cls}-k-${n}`;
  const d = (s: number) => `calc(${s}s * var(--anim-speed, 1))`;
  const doneSel = done.split(',').map((s) => `${s.trim()}.${cls}`).join(',');
  return `
.${cls}{will-change:transform}
${a('march')}{border-color:transparent!important}
.${cls}-march{position:absolute;inset:-1px;width:calc(100% + 2px);height:calc(100% + 2px);overflow:visible;pointer-events:none}
.${cls}-march rect{fill:none;stroke:var(--card-color,#1f2a44);stroke-width:2;stroke-dasharray:7 5;
  animation:${k('march')} ${d(0.9)} linear infinite}
@keyframes ${k('march')}{to{stroke-dashoffset:-24}}

${a('shine')}::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:1;
  background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.78) 50%,transparent 62%) no-repeat;background-size:260% 100%;
  background-position:160% 0;animation:${k('shine')} ${d(3.2)} ease-in-out infinite}
@keyframes ${k('shine')}{0%{background-position:160% 0}45%,100%{background-position:-60% 0}}

${a('pulse')}{animation:${k('pulse')} ${d(2.2)} ease-in-out infinite}
@keyframes ${k('pulse')}{0%,60%,100%{transform:scale(1)}20%{transform:scale(1.025)}40%{transform:scale(.995)}}

${a('glow')}{animation:${k('glow')} ${d(2.4)} ease-in-out infinite}
@keyframes ${k('glow')}{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--card-color,#1f2a44) 0%,transparent)}
  50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--card-color,#1f2a44) 22%,transparent),0 6px 18px -6px color-mix(in srgb,var(--card-color,#1f2a44) 45%,transparent)}}

${a('shake')}{animation:${k('shake')} ${d(3.4)} ease-in-out infinite}
@keyframes ${k('shake')}{0%,70%,100%{transform:translate3d(0,0,0) rotate(0)}73%{transform:translate3d(-3px,0,0) rotate(-.6deg)}
  76%{transform:translate3d(3px,0,0) rotate(.6deg)}79%{transform:translate3d(-2px,0,0) rotate(-.4deg)}82%{transform:translate3d(2px,0,0) rotate(.3deg)}85%{transform:translate3d(0,0,0)}}

${doneSel}{animation:none}
${done.split(',').map((s) => `${s.trim()}.${cls}::before`).join(',')}{animation:none;opacity:0}
${done.split(',').map((s) => `${s.trim()} .${cls}-march rect`).join(',')}{animation:none}
@media (prefers-reduced-motion:reduce){.${cls},.${cls}::before,.${cls}-march rect{animation:none!important}}
`;
}
