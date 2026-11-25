import { Inject, Injectable } from '@nestjs/common';
import type { ReverseGeocodeResponse } from '@cod/contracts';
import { RedisService } from '../../infra/redis/redis.service';
import { GEOCODING_PROVIDER, type IGeocodingProvider } from '../../infra/providers/geocoding/geocoding.provider';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { locateDO } from '../../infra/providers/geocoding/do-locate';

/**
 * Control de coste, que es la única pega de Google.
 * Caché por celda geohash (~150 m) durante 30 días: en una ciudad, el 80-90 %
 * de los reverse hits salen de Redis y no llegan a Google.
 */
@Injectable()
export class LocationService {
  private readonly TTL = 60 * 60 * 24 * 30;
  private readonly quota = Number(process.env.GEOCODING_DAILY_QUOTA_PER_SHOP ?? 2000);

  constructor(
    private redis: RedisService,
    @Inject(GEOCODING_PROVIDER) private provider: IGeocodingProvider,
  ) {}

  async reverse(ctx: ShopContext, lat: number, lng: number): Promise<ReverseGeocodeResponse> {
    const cell = geohash(lat, lng, 7);
    const cacheKey = `geo:rev:${cell}`; // global: la geografía no es de nadie

    const cached = await this.redis.client.get(cacheKey);
    if (cached) return withPlace(JSON.parse(cached) as ReverseGeocodeResponse, lat, lng);

    // Cuota diaria por tienda. Si se agota, se degrada a campos manuales:
    // el formulario NUNCA se rompe por un tema de facturación.
    const today = new Date().toISOString().slice(0, 10);
    const quotaKey = this.redis.key(ctx.shopId, 'geo:quota', today);
    if (!(await this.redis.allow(quotaKey, this.quota, 86_400))) {
      return withPlace({ ...EMPTY, confidence: 0 }, lat, lng);
    }

    let result: ReverseGeocodeResponse;
    try { result = await this.provider.reverse(lat, lng); } catch { result = EMPTY; }
    // Solo se guarda lo que respondió Google (si falla, se vuelve a intentar luego).
    if (result.confidence > 0) {
      await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', this.TTL);
    }
    return withPlace(result, lat, lng);
  }
}

/**
 * Provincia (y municipio, si Google no lo dio) con los límites oficiales de RD.
 * La provincia SIEMPRE sale de aquí: es la que decide qué extras y envíos se
 * ofrecen, y no puede depender de que Google responda.
 */
function withPlace(r: ReverseGeocodeResponse, lat: number, lng: number): ReverseGeocodeResponse {
  const place = locateDO(lat, lng);
  if (!place) return r;
  return {
    ...r,
    country: r.country ?? 'República Dominicana',
    province: place.province,
    provinceCode: place.provinceCode,
    city: r.city ?? place.municipality,
    formatted: r.formatted ?? `${place.municipality}, ${place.province}`,
    confidence: Math.max(r.confidence, 0.5),
  };
}

/** Geohash estándar. Precisión 7 ≈ 153 × 153 m. */
function geohash(lat: number, lng: number, precision: number): string {
  const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = '', bit = 0, ch = 0, even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng > mid) { ch = (ch << 1) + 1; lngMin = mid; } else { ch <<= 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) { ch = (ch << 1) + 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += B32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

const EMPTY: ReverseGeocodeResponse = {
  formatted: null, country: null, province: null, provinceCode: null,
  city: null, district: null, street: null, number: null, postalCode: null, confidence: 0,
};
