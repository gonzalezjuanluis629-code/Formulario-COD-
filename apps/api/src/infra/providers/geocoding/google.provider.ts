import { Injectable, Logger } from '@nestjs/common';
import type { ReverseGeocodeResponse } from '@cod/contracts';
import { matchProvince } from '@cod/geo';
import type { IGeocodingProvider } from './geocoding.provider';

interface GoogleComponent { long_name: string; short_name: string; types: string[] }
interface GoogleResult { formatted_address: string; address_components: GoogleComponent[] }

/**
 * Google Geocoding API. La KEY VIVE AQUÍ, EN EL SERVIDOR. Nunca en el navegador.
 * (La única key que ve el cliente es la de Maps JS, restringida por referrer.)
 */
@Injectable()
export class GoogleGeocodingProvider implements IGeocodingProvider {
  readonly name = 'google';
  private readonly log = new Logger(GoogleGeocodingProvider.name);
  private readonly key = process.env.GOOGLE_MAPS_SERVER_KEY ?? '';

  async reverse(lat: number, lng: number): Promise<ReverseGeocodeResponse> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', this.key);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'do');

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const body = (await res.json()) as { status: string; results: GoogleResult[] };

    if (body.status !== 'OK' || !body.results.length) {
      this.log.warn(`Google devolvió ${body.status}`);
      return EMPTY;
    }

    const r = body.results[0]!;
    const get = (type: string) =>
      r.address_components.find((c) => c.types.includes(type))?.long_name ?? null;

    // En RD, Google mapea el sector a sublocality / neighborhood.
    const district = get('sublocality_level_1') ?? get('sublocality') ?? get('neighborhood');
    const province = get('administrative_area_level_1');

    return {
      formatted: r.formatted_address,
      country: get('country'),
      province,
      provinceCode: matchProvince(province),
      city: get('locality') ?? get('administrative_area_level_2'),
      district,
      street: get('route'),
      number: get('street_number'),
      postalCode: get('postal_code'),
      confidence: district ? 0.9 : province ? 0.6 : 0.3,
    };
  }
}

const EMPTY: ReverseGeocodeResponse = {
  formatted: null, country: null, province: null, provinceCode: null,
  city: null, district: null, street: null, number: null, postalCode: null, confidence: 0,
};
