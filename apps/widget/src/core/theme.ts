import type { ThemeTokens } from '@cod/contracts';
import { ANIMATION_SPEEDS } from '../ui/animations';

/** Fondo CSS de un botón: color sólido o degradado. */
export function buttonBackground(b: { bg: string; bgType?: 'solid' | 'gradient'; bg2?: string; gradientAngle?: number; depth?: boolean }): string {
  const base = b.bgType === 'gradient'
    ? `linear-gradient(${b.gradientAngle ?? 135}deg, ${b.bg}, ${b.bg2 ?? b.bg})`
    : b.bg;
  // Profundidad: brillo arriba y un poco más oscuro abajo, encima del color.
  return b.depth
    ? `linear-gradient(180deg, rgba(255,255,255,.26) 0%, rgba(255,255,255,.06) 48%, rgba(0,0,0,.12) 100%), ${base}`
    : base;
}

/**
 * Los design tokens del panel → CSS custom properties.
 * Cambiar la marca en el admin repinta el formulario entero, sin deploy.
 */
/**
 * Sombra del botón como filtro (drop-shadow): las animaciones usan box-shadow y
 * transform, así que sombra y animación se combinan sin pisarse.
 */
export function buttonShadow(b: { shadow?: 'none' | 'sm' | 'md' | 'lg'; shadowColor?: string; depth?: boolean; bg?: string }): string {
  const c = b.shadowColor || '#000000';
  const mix = (pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  // Profundidad: resplandor del MISMO color del botón debajo (como los de Figui).
  const glow = b.depth && b.bg
    ? ` drop-shadow(0 7px 9px color-mix(in srgb, ${b.bg} 45%, transparent)) drop-shadow(0 2px 2px color-mix(in srgb, ${b.bg} 22%, transparent))`
    : '';
  switch (b.shadow) {
    case 'sm': return `drop-shadow(0 2px 3px ${mix(30)})${glow}`;
    case 'md': return `drop-shadow(0 6px 10px ${mix(32)})${glow}`;
    case 'lg': return `drop-shadow(0 12px 20px ${mix(38)}) drop-shadow(0 3px 5px ${mix(20)})${glow}`;
    default: return glow ? glow.trim() : 'drop-shadow(0 0 0 transparent)';
  }
}

export function tokensToCss(t: ThemeTokens): string {
  const shadow = { none: 'none', sm: '0 1px 3px rgba(0,0,0,.08)', md: '0 4px 20px rgba(0,0,0,.12)', lg: '0 10px 40px rgba(0,0,0,.18)' }[t.shadow];
  const gap = { compact: '11px', normal: '15px', relaxed: '20px' }[t.spacing];

  return `
    --cod-brand:${t.brand};
    --cod-ok:${t.success};
    --cod-danger:${t.danger};
    --cod-surface:${t.surface};
    --cod-field:${t.field};
    --cod-border:${t.border};
    --cod-text:${t.text};
    --cod-muted:${t.muted};
    --cod-font:${t.fontFamily};
    --cod-size:${t.fontSize}px;
    --cod-radius:${t.radius}px;
    --cod-btn-radius:${t.submit.radius}px;
    --cod-btn-height:${t.submit.height}px;
    --cod-btn-size:${t.submit.fontSize}px;
    --cod-btn-bg:${buttonBackground(t.submit)};
    --cod-btn-solid:${t.submit.bg};
    --cod-apply-bg:${t.applyBg};
    --cod-offer-accent:${t.offerCard.accent};
    ${t.offerCard.glow === false ? '--cod-offer-glow:none;' : ''}
    --cod-badge-from:${t.offerCard.badgeFrom};
    --cod-badge-to:${t.offerCard.badgeTo};
    --cod-badge-color:${t.offerCard.badgeColor};
    --cod-save-bg:${t.offerCard.saveBg};
    --cod-save-color:${t.offerCard.saveColor};
    --cod-apply-color:${t.applyColor};
    --cod-btn-shadow:${buttonShadow(t.submit)};
    --anim-speed:${ANIMATION_SPEEDS[t.submit.animationSpeed ?? 'normal']};
    --cod-btn-color:${t.submit.color};
    --cod-btn-ready:${t.submit.readyBg || t.readyColor};
    --cod-shadow:${shadow};
    --cod-gap:${gap};
    --cod-progress:${t.progressColor};
    --cod-ease:${t.animations ? 'cubic-bezier(.32,.72,0,1)' : 'linear'};
    --cod-dur:${t.animations ? '.3s' : '0s'};
  `;
}
