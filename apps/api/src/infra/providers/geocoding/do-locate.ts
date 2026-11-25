import { DO_PROVINCES } from '@cod/geo';
import { DO_MUNICIPIOS } from './do-municipios.data';

/**
 * Provincia y municipio de un punto de República Dominicana, SIN servicios
 * externos: con los límites oficiales (ONE). Sirve aunque Google falle o no
 * tenga cuota, y es lo que decide qué extras y envíos se ofrecen («solo en
 * Santo Domingo»…).
 */
interface Muni { name: string; province: string; box: [number, number, number, number]; rings: Float64Array[] }

let MUNIS: Muni[] | null = null;

function load(): Muni[] {
  if (MUNIS) return MUNIS;
  MUNIS = DO_MUNICIPIOS.map((m) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const rings = m.r.map((flat) => {
      const out = new Float64Array(flat.length);
      let x = 0, y = 0;
      for (let i = 0; i < flat.length; i += 2) {
        x += flat[i]!; y += flat[i + 1]!;
        const lng = x / 1e4, lat = y / 1e4;
        out[i] = lng; out[i + 1] = lat;
        if (lng < x0) x0 = lng; if (lng > x1) x1 = lng;
        if (lat < y0) y0 = lat; if (lat > y1) y1 = lat;
      }
      return out;
    });
    return { name: m.m, province: m.p, box: [x0, y0, x1, y1] as [number, number, number, number], rings };
  });
  return MUNIS;
}

function inside(ring: Float64Array, lng: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!, yi = ring[i + 1]!, xj = ring[j]!, yj = ring[j + 1]!;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Distancia aproximada (en grados) del punto al borde del anillo. */
function distTo(ring: Float64Array, lng: number, lat: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < ring.length; i += 2) {
    const ax = ring[i]!, ay = ring[i + 1]!, bx = ring[i + 2]!, by = ring[i + 3]!;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((lng - ax) * dx + (lat - ay) * dy) / L)) : 0;
    const ex = ax + t * dx - lng, ey = ay + t * dy - lat;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export interface DoPlace { provinceCode: string; province: string; municipality: string }

export function locateDO(lat: number, lng: number): DoPlace | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const munis = load();
  const toPlace = (m: Muni): DoPlace => ({
    provinceCode: m.province,
    province: DO_PROVINCES.find((p) => p.code === m.province)?.name ?? m.province,
    municipality: m.name,
  });
  for (const m of munis) {
    const [x0, y0, x1, y1] = m.box;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    if (m.rings.some((r) => inside(r, lng, lat))) return toPlace(m);
  }
  // En la orilla del mar o justo en un borde: el municipio más cercano (hasta ~2 km).
  let best: Muni | null = null, bestD = 0.02;
  for (const m of munis) {
    const [x0, y0, x1, y1] = m.box;
    if (lng < x0 - bestD || lng > x1 + bestD || lat < y0 - bestD || lat > y1 + bestD) continue;
    for (const r of m.rings) { const d = distTo(r, lng, lat); if (d < bestD) { bestD = d; best = m; } }
  }
  return best ? toPlace(best) : null;
}
