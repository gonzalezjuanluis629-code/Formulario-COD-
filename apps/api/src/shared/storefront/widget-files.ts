import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carpeta del widget ya compilado (apps/widget/dist), servida en /storefront/widget. */
export const WIDGET_DIST = resolve(__dirname, '../../../../widget/dist');

let cached: { stamp: number; files: string[] } | null = null;

/**
 * Partes del widget que el navegador necesita para pintar el botón: el código
 * principal que importa widget.js y el botón «Comprar ahora». El cargador las
 * pide todas a la vez (en vez de una detrás de otra).
 */
export function widgetPreloads(): string[] {
  const entryPath = resolve(WIDGET_DIST, 'widget.js');
  try {
    // Se vuelve a leer si el widget cambió (nunca se piden partes que ya no existen).
    const stamp = statSync(entryPath).mtimeMs;
    if (cached?.stamp === stamp) return cached.files;
    const entry = readFileSync(entryPath, 'utf8');
    const imported = [...entry.matchAll(/from\s*["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1]!);
    const trigger = readdirSync(WIDGET_DIST).filter((f) => /^trigger-[\w-]+\.js$/.test(f));
    cached = { stamp, files: [...new Set([...imported, ...trigger])] };
    return cached.files;
  } catch {
    return [];
  }
}
