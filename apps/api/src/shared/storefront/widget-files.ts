import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carpeta del widget ya compilado (apps/widget/dist), servida en /storefront/widget. */
export const WIDGET_DIST = resolve(__dirname, '../../../../widget/dist');

let cached: string[] | null = null;

/**
 * Partes del widget que el navegador necesita para pintar el botón: el código
 * principal que importa widget.js y el botón «Comprar ahora». El cargador las
 * pide todas a la vez (en vez de una detrás de otra).
 */
export function widgetPreloads(): string[] {
  if (cached) return cached;
  try {
    const entry = readFileSync(resolve(WIDGET_DIST, 'widget.js'), 'utf8');
    const imported = [...entry.matchAll(/from\s*["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1]!);
    const trigger = readdirSync(WIDGET_DIST).filter((f) => /^trigger-[\w-]+\.js$/.test(f));
    cached = [...new Set([...imported, ...trigger])];
  } catch {
    cached = [];
  }
  return cached;
}
