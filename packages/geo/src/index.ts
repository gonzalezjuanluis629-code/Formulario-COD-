import { DO_PROFILE } from './do';
import type { CountryProfile } from './types';

export * from './types';
export { DO_PROFILE, DO_PROVINCES, matchProvince } from './do';

const REGISTRY: Record<string, CountryProfile> = { DO: DO_PROFILE };

/** Añadir un país = registrar su perfil aquí. El dominio no se toca. */
/**
 * El formulario está hecho para República Dominicana (teléfonos 809/829/849,
 * provincias de RD). Si la tienda tiene otro país en Shopify (las tiendas de
 * prueba vienen con EE. UU.), se usa RD en vez de rechazar el pedido.
 */
export const DEFAULT_COUNTRY = 'DO';

export function getCountryProfile(code: string | null | undefined): CountryProfile {
  return REGISTRY[(code ?? '').toUpperCase()] ?? REGISTRY[DEFAULT_COUNTRY]!;
}
