import { Injectable, NotFoundException } from '@nestjs/common';
import type { QuoteRequest, QuoteResponse, Offer } from '@cod/contracts';
import { ShopSettingsSchema, OfferSchema } from '@cod/contracts';
import { quote as runPricing } from '@cod/pricing';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminClientService } from '../../infra/shopify/admin-client.service';
import { DiscountsService } from '../discounts/discounts.service';
import { AddonsService } from '../addons/addons.service';
import type { ShopContext } from '../../infra/shopify/shop-context.service';

/**
 * El precio SIEMPRE se recalcula aquí. El del cliente es solo una previsualización.
 * El precio unitario se lee de Shopify, no del navegador: si no, cualquiera
 * compraría a RD$ 1 editando el DOM.
 */
@Injectable()
export class QuoteService {
  constructor(
    private prisma: PrismaService,
    private admin: AdminClientService,
    private discounts: DiscountsService,
    private addons: AddonsService,
  ) {}

  async compute(ctx: ShopContext, dto: QuoteRequest): Promise<QuoteResponse> {
    const settings = ShopSettingsSchema.parse(ctx.settings ?? {});
    const unitPriceCents = await this.variantPrice(ctx, dto.variantId);

    const offers = await this.prisma.offer.findMany({
      where: { shopId: ctx.shopId, active: true, type: 'QUANTITY' },
      orderBy: { priority: 'desc' },
    });

    const parsed: Offer[] = offers.map((o) =>
      OfferSchema.parse({ id: o.id, label: o.name, type: 'QUANTITY', ...(o.payload as object) }),
    );

    const discount = await this.discounts.validate(ctx, dto.discountCode ?? null);

    // Total de los addons aceptados, con precio verificado en Shopify.
    const { totalCents: addonsCents } = await this.addons.resolve(ctx, dto.addonIds ?? []);

    // Tarifa de la provincia declarada. Si no hay una configurada, cae a la default.
    const province = dto.province ?? null;
    const provinceShippingCents =
      province && settings.shippingByProvince[province] != null
        ? settings.shippingByProvince[province]
        : null;

    return runPricing({
      qty: dto.qty,
      unitPriceCents,
      currency: settings.currency,
      offers: parsed,
      defaultShippingCents: settings.defaultShippingCents,
      freeShippingOverCents: settings.freeShippingOverCents,
      provinceShippingCents,
      codFeeCents: settings.codFeeCents,
      discount,
      addonsCents,
    });
  }

  /** Precio real de la variante, cacheado 60 s. */
  private async variantPrice(ctx: ShopContext, variantId: string): Promise<number> {
    const data = await this.admin.graphql<{
      productVariant: { price: string; availableForSale: boolean } | null;
    }>(ctx, `query($id: ID!){ productVariant(id:$id){ price availableForSale } }`, { id: variantId });

    if (!data.productVariant) throw new NotFoundException('Variante no encontrada');
    return Math.round(parseFloat(data.productVariant.price) * 100);
  }
}
