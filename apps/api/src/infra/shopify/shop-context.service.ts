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
      clientSecret: this.crypto.decrypt(shop.id, Buffer.from(shop.shopifyApp.clientSecretEnc)),
      settings: (shop.settings ?? {}) as Record<string, unknown>,
      currency: shop.currency,
      countryCode: shop.countryCode,
    };

    this.cache.set(domain, { ctx, exp: Date.now() + this.TTL_MS });
    return ctx;
  }

  invalidate(domain: string) { this.cache.delete(domain); }
}
