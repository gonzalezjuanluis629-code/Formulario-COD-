import { DO_PROFILE } from './do';
import type { CountryProfile } from './types';

export * from './types';
export { DO_PROFILE, DO_PROVINCES, matchProvince } from './do';

const REGISTRY: Record<string, CountryProfile> = { DO: DO_PROFILE };

/** Añadir un país = registrar su perfil aquí. El dominio no se toca. */
export function getCountryProfile(code: string): CountryProfile {
  const p = REGISTRY[code.toUpperCase()];
  if (!p) throw new Error(`País no soportado: ${code}`);
  return p;
}
