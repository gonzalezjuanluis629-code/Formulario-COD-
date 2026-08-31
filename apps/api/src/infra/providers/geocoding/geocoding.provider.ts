import type { ReverseGeocodeResponse } from '@cod/contracts';

/**
 * Dependency Inversion: el dominio depende de ESTA interfaz, no de Google.
 * Cambiar de proveedor = escribir otra clase. Cero cambios en el resto.
 */
export interface IGeocodingProvider {
  readonly name: string;
  reverse(lat: number, lng: number): Promise<ReverseGeocodeResponse>;
}

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');
