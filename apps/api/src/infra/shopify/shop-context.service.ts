import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';

export interface ShopContext {
  shopId: string;
  domain: string;
  accessToken: string;
  apiVersion: string;
  /** Secreto de LA app custom de ESTA tienda. Camino A: hay una por tienda. */
  clientSecret: string;
  settings: Record<string, unknown>;
  currency: string;
  countryCode: string;
}

/**
 * Camino A: N custom apps → 1 backend.
 * Las credenciales NO salen de una env var global: se resuelven a partir
 * del dominio de la tienda. Cacheado en memoria (TTL corto) porque esto
 * se llama en CADA request del storefront.
 */
@Injectable()
export class ShopContextService {
  private cache = new Map<string, { ctx: ShopContext; exp: number }>();
  private readonly TTL_MS = 60_000;

  constructor(private prisma: PrismaService, private crypto: CryptoService) {}

  async byDomain(domain: string): Promise<ShopContext> {
    const hit = this.cache.get(domain);
    if (hit && hit.exp > Date.now()) return hit.ctx;

    const shop = await this.prisma.shop.findUnique({
      where: { domain },
      include: { shopifyApp: true },
    });
    if (!shop || shop.uninstalledAt) throw new NotFoundException('Tienda no instalada');

    const ctx: ShopContext = {
      shopId: shop.id,
      domain: shop.domain,
      accessToken: this.crypto.decrypt(shop.id, Buffer.from(shop.accessTokenEnc)),
      apiVersion: shop.shopifyApp.apiVersion,
      clientSecret: await this.clientSecret(shop.id, shop.shopifyApp.id, Buffer.from(shop.shopifyApp.clientSecretEnc)),
      settings: (shop.settings ?? {}) as Record<string, unknown>,
      currency: shop.currency,
      countryCode: shop.countryCode,
    };

    this.cache.set(domain, { ctx, exp: Date.now() + this.TTL_MS });
    return ctx;
  }

  invalidate(domain: string) { this.cache.delete(domain); }

  /**
   * El secreto se cifra con una clave ligada a la app (`app:<id>`). Las
   * instalaciones antiguas lo cifraban con el id de la última tienda instalada,
   * así que, si hace falta, se prueba con esas claves para no romper nada.
   */
  private async clientSecret(shopId: string, appId: string, blob: Buffer): Promise<string> {
    const candidates = [`app:${appId}`, shopId];
    for (const id of candidates) {
      try { return this.crypto.decrypt(id, blob); } catch { /* siguiente */ }
    }
    const others = await this.prisma.shop.findMany({
      where: { shopifyAppId: appId, id: { not: shopId } }, select: { id: true },
    });
    for (const o of others) {
      try { return this.crypto.decrypt(o.id, blob); } catch { /* siguiente */ }
    }
    throw new NotFoundException('No se pudo leer el secreto de la app');
  }
}
