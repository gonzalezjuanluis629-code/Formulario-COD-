import type { ThemeTokens } from '@cod/contracts';

/**
 * Los design tokens del panel → CSS custom properties.
 * Cambiar la marca en el admin repinta el formulario entero, sin deploy.
 */
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
    --cod-btn-bg:${t.submit.bg};
    --cod-btn-color:${t.submit.color};
    --cod-btn-ready:${t.submit.readyBg || t.readyColor};
    --cod-shadow:${shadow};
    --cod-gap:${gap};
    --cod-progress:${t.progressColor};
    --cod-ease:${t.animations ? 'cubic-bezier(.32,.72,0,1)' : 'linear'};
    --cod-dur:${t.animations ? '.3s' : '0s'};
  `;
}
