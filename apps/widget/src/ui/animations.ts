/**
 * Animaciones de los botones («Comprar ahora» y «Finalizar pedido»).
 *
 * Una sola definición para la tienda, la vista previa y el selector del panel:
 * lo que el comerciante ve en el panel es exactamente lo que verá el cliente.
 *
 * Reglas:
 * - Llaman la atención en ráfagas con pausa (no molestan todo el rato).
 * - Solo animan transform y opacity (la tarjeta gráfica del teléfono lo hace
 *   sola, sin volver a dibujar). Las sombras y halos van en ::before con un
 *   dibujo fijo, y lo que se anima es su opacidad o su tamaño.
 * - La velocidad se ajusta con --anim-speed (1 = normal).
 * - Respetan «reducir movimiento» del sistema.
 */

export const BUTTON_ANIMATIONS = [
  { id: 'none', label: 'Ninguna' },
  { id: 'pulse', label: 'Latido' },
  { id: 'heartbeat', label: 'Corazón' },
  { id: 'bounce', label: 'Rebote' },
  { id: 'float', label: 'Flotar' },
  { id: 'shake', label: 'Vibrar' },
  { id: 'wobble', label: 'Balanceo' },
  { id: 'jello', label: 'Gelatina' },
  { id: 'tada', label: 'Tada' },
  { id: 'shine', label: 'Brillo' },
  { id: 'glow', label: 'Resplandor' },
  { id: 'ripple', label: 'Ondas' },
] as const;

export type ButtonAnimation = (typeof BUTTON_ANIMATIONS)[number]['id'];

export const ANIMATION_SPEEDS = { slow: 1.6, normal: 1, fast: 0.6 } as const;

/**
 * CSS de todas las animaciones para un tipo de botón.
 * @param cls     clase base del botón, p. ej. "cod-trigger"
 * @param color   variable CSS con el color sólido del botón (para brillos y ondas)
 */
export function buttonAnimationCss(cls: string, color: string): string {
  const k = (n: string) => `${cls}-k-${n}`;
  const a = (n: string) => `.${cls}.${cls}-anim-${n}`;
  const d = (s: number) => `calc(${s}s * var(--anim-speed, 1))`;
  return `
.${cls}{position:relative;isolation:isolate}
.${cls}[class*="${cls}-anim-"]:not(.${cls}-anim-none){will-change:transform;backface-visibility:hidden}
${a('pulse')}{overflow:visible;animation:${k('pulse')} ${d(1.8)} ease-in-out infinite}
${a('pulse')}::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  box-shadow:0 0 0 7px color-mix(in srgb,${color} 40%,transparent);opacity:0;animation:${k('pulse-ring')} ${d(1.8)} ease-out infinite}
@keyframes ${k('pulse')}{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes ${k('pulse-ring')}{0%{transform:scale(.96);opacity:.9}70%,100%{transform:scale(1.06,1.2);opacity:0}}

${a('heartbeat')}{animation:${k('heartbeat')} ${d(2.2)} ease-in-out infinite}
@keyframes ${k('heartbeat')}{0%,40%,100%{transform:scale(1)}8%{transform:scale(1.08)}16%{transform:scale(.98)}24%{transform:scale(1.08)}32%{transform:scale(1)}}

${a('bounce')}{animation:${k('bounce')} ${d(2)} cubic-bezier(.28,.84,.42,1) infinite}
@keyframes ${k('bounce')}{0%,50%,100%{transform:translateY(0)}15%{transform:translateY(-10px)}28%{transform:translateY(0)}
  36%{transform:translateY(-4px)}44%{transform:translateY(0)}}

${a('float')}{animation:${k('float')} ${d(3)} ease-in-out infinite}
@keyframes ${k('float')}{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

${a('shake')}{animation:${k('shake')} ${d(2.8)} ease-in-out infinite}
@keyframes ${k('shake')}{0%,62%,100%{transform:translateX(0)}65%,71%,77%,83%{transform:translateX(-5px)}68%,74%,80%{transform:translateX(5px)}86%{transform:translateX(2px)}}

${a('wobble')}{animation:${k('wobble')} ${d(2.8)} ease-in-out infinite}
@keyframes ${k('wobble')}{0%,60%,100%{transform:rotate(0)}64%{transform:rotate(-4deg)}70%{transform:rotate(4deg)}
  76%{transform:rotate(-3deg)}82%{transform:rotate(2deg)}88%{transform:rotate(-1deg)}}

${a('jello')}{animation:${k('jello')} ${d(2.8)} ease-in-out infinite}
@keyframes ${k('jello')}{0%,60%,100%{transform:none}66%{transform:scale3d(1.18,.82,1)}72%{transform:scale3d(.88,1.12,1)}
  78%{transform:scale3d(1.06,.94,1)}84%{transform:scale3d(.97,1.03,1)}90%{transform:scale3d(1.01,.99,1)}}

${a('tada')}{animation:${k('tada')} ${d(3)} ease-in-out infinite}
@keyframes ${k('tada')}{0%,60%,100%{transform:none}63%,66%{transform:scale(.94) rotate(-3deg)}
  70%,78%,86%{transform:scale(1.07) rotate(3deg)}74%,82%{transform:scale(1.07) rotate(-3deg)}90%{transform:scale(1)}}

${a('shine')}{overflow:hidden}
${a('shine')}::after{content:"";position:absolute;inset:-2px;pointer-events:none;z-index:1;
  background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.6) 48%,rgba(255,255,255,.15) 55%,transparent 70%);
  transform:translateX(-120%);animation:${k('shine')} ${d(2.6)} ease-in-out infinite}
@keyframes ${k('shine')}{0%,45%{transform:translateX(-120%)}100%{transform:translateX(120%)}}

${a('glow')}{overflow:visible}
${a('glow')}::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  box-shadow:0 0 0 3px color-mix(in srgb,${color} 25%,transparent),0 0 26px 4px color-mix(in srgb,${color} 65%,transparent);
  opacity:.15;animation:${k('glow')} ${d(2.2)} ease-in-out infinite}
@keyframes ${k('glow')}{0%,100%{opacity:.15}50%{opacity:1}}

${a('ripple')}{overflow:visible}
${a('ripple')}::before,${a('ripple')}::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  border:2px solid ${color};animation:${k('ripple')} ${d(2.4)} cubic-bezier(.2,.6,.35,1) infinite}
${a('ripple')}::after{animation-delay:calc(1.2s * var(--anim-speed, 1))}
@keyframes ${k('ripple')}{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.18,1.45);opacity:0}}

@media (prefers-reduced-motion: reduce){.${cls},.${cls}::before,.${cls}::after{animation:none!important}}
`;
}
