/**
 * Perfil de República Dominicana.
 * Añadir otro país = añadir otro archivo como este. Cero cambios en el dominio.
 */
import type { CountryProfile } from './types';

/** ISO 3166-2:DO. Shopify acepta estos códigos en `provinceCode`. */
export const DO_PROVINCES = [
  { code: 'DO-01', name: 'Distrito Nacional' },
  { code: 'DO-02', name: 'Azua' },
  { code: 'DO-03', name: 'Bahoruco' },
  { code: 'DO-04', name: 'Barahona' },
  { code: 'DO-05', name: 'Dajabón' },
  { code: 'DO-06', name: 'Duarte' },
  { code: 'DO-07', name: 'Elías Piña' },
  { code: 'DO-08', name: 'El Seibo' },
  { code: 'DO-09', name: 'Espaillat' },
  { code: 'DO-10', name: 'Independencia' },
  { code: 'DO-11', name: 'La Altagracia' },
  { code: 'DO-12', name: 'La Romana' },
  { code: 'DO-13', name: 'La Vega' },
  { code: 'DO-14', name: 'María Trinidad Sánchez' },
  { code: 'DO-15', name: 'Monte Cristi' },
  { code: 'DO-16', name: 'Pedernales' },
  { code: 'DO-17', name: 'Peravia' },
  { code: 'DO-18', name: 'Puerto Plata' },
  { code: 'DO-19', name: 'Hermanas Mirabal' },
  { code: 'DO-20', name: 'Samaná' },
  { code: 'DO-21', name: 'San Cristóbal' },
  { code: 'DO-22', name: 'San Juan' },
  { code: 'DO-23', name: 'San Pedro de Macorís' },
  { code: 'DO-24', name: 'Sánchez Ramírez' },
  { code: 'DO-25', name: 'Santiago' },
  { code: 'DO-26', name: 'Santiago Rodríguez' },
  { code: 'DO-27', name: 'Valverde' },
  { code: 'DO-28', name: 'Monseñor Nouel' },
  { code: 'DO-29', name: 'Monte Plata' },
  { code: 'DO-30', name: 'Hato Mayor' },
  { code: 'DO-31', name: 'San José de Ocoa' },
  { code: 'DO-32', name: 'Santo Domingo' },
] as const;

const strip = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Alias que devuelve Google/OSM y que NO coinciden literalmente con el nombre oficial. */
const ALIASES: Record<string, string> = {
  'santo domingo de guzman': 'DO-01',
  'distrito nacional': 'DO-01',
  'national district': 'DO-01',
  'santiago de los caballeros': 'DO-25',
  'salcedo': 'DO-19',
  'san francisco de macoris': 'DO-06',
  'bonao': 'DO-28',
  'higuey': 'DO-11',
  'la altagracia': 'DO-11',
  'bavaro': 'DO-11',
  'punta cana': 'DO-11',
  'baoruco': 'DO-03',
};

/** Distancia de Levenshtein — tolera erratas del geocoder. */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/**
 * Convierte lo que devuelve el geocoder en un provinceCode válido para Shopify.
 * Devuelve null si no hay una coincidencia confiable: NUNCA inventamos un código,
 * porque un provinceCode inválido hace fallar el orderCreate entero.
 */
export function matchProvince(input: string | null | undefined): string | null {
  if (!input) return null;
  const q = strip(input);
  if (ALIASES[q]) return ALIASES[q];

  let best: { code: string; d: number } | null = null;
  for (const p of DO_PROVINCES) {
    const d = lev(q, strip(p.name));
    if (!best || d < best.d) best = { code: p.code, d };
  }
  if (!best) return null;
  // Tolerancia proporcional: hasta ~25 % de caracteres distintos.
  return best.d <= Math.max(2, Math.floor(q.length * 0.25)) ? best.code : null;
}

export const DO_PROFILE: CountryProfile = {
  code: 'DO',
  currency: 'DOP',
  postalCodeRequired: false, // En RD casi nadie lo conoce. Ocultarlo = menos abandono.
  provinces: DO_PROVINCES.map((p) => ({ ...p })),
  matchProvince,

  phone: {
    prefix: '+1',
    areaCodes: ['809', '829', '849'],
    /** Acepta "809 555 1234", "(809)555-1234", "+18095551234"… */
    normalize(raw: string): string | null {
      const d = raw.replace(/\D/g, '');
      const local = d.startsWith('1') && d.length === 11 ? d.slice(1) : d;
      if (local.length !== 10) return null;
      if (!['809', '829', '849'].includes(local.slice(0, 3))) return null;
      return `+1${local}`; // E.164 — es lo que exige Shopify
    },
    format(e164: string): string {
      const d = e164.replace(/\D/g, '').slice(-10);
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    },
  },

  /**
   * Shopify solo tiene province + city. El sector dominicano no tiene campo
   * propio, así que va en address2 con etiqueta explícita.
   */
  toShopifyAddress(a) {
    return {
      address1: [a.street, a.number].filter(Boolean).join(' ') || a.formatted || '',
      address2: a.district ? `Sector: ${a.district}` : null,
      city: a.city ?? '',
      provinceCode: a.provinceCode,
      countryCode: 'DO',
      zip: a.postalCode ?? null,
    };
  },
};
