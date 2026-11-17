import { Injectable, NotFoundException } from '@nestjs/common';
import type { QuoteRequest, QuoteResponse, Offer, CartLine } from '@cod/contracts';
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
    const settings = { ...ShopSettingsSchema.parse(ctx.settings ?? {}), ...(ctx.currency ? { currency: ctx.currency } : {}) };
    const lines = orderLines(dto);

    // Un solo producto (aunque venga del carrito): precio × cantidad y las
    // ofertas por cantidad aplican. Varios productos: la suma de cada línea
    // con su precio real; las ofertas por cantidad son de un producto, no aplican.
    let qty: number;
    let unitPriceCents: number;
    let parsed: Offer[] = [];
    const [only] = lines;
    if (lines.length === 1 && only) {
      qty = only.qty;
      unitPriceCents = await this.variantPrice(ctx, only.variantId);
      const offers = await this.prisma.offer.findMany({
        where: { shopId: ctx.shopId, active: true, type: 'QUANTITY' },
        orderBy: { priority: 'desc' },
      });
      parsed = offers.map((o) =>
        OfferSchema.parse({ id: o.id, label: o.name, type: 'QUANTITY', ...(o.payload as object) }),
      );
    } else {
      qty = 1;
      unitPriceCents = await this.cartPrice(ctx, lines);
    }

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
      qty,
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

  /** Suma del carrito con el precio real de cada variante en Shopify. */
  private async cartPrice(ctx: ShopContext, lines: CartLine[]): Promise<number> {
    const data = await this.admin.graphql<{ nodes: ({ id: string; price?: string } | null)[] }>(
      ctx, `query($ids: [ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id price } } }`,
      { ids: lines.map((l) => l.variantId) },
    );
    const price = new Map(data.nodes.filter((n): n is { id: string; price: string } => !!n?.price).map((n) => [n.id, n.price]));
    let total = 0;
    for (const l of lines) {
      const p = price.get(l.variantId);
      if (p == null) throw new NotFoundException('Un producto del carrito ya no está disponible. Recarga la página.');
      total += Math.round(parseFloat(p) * 100) * l.qty;
    }
    return total;
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

const VARIANT_GID = (id: string) => (/^\d+$/.test(id) ? `gid://shopify/ProductVariant/${id}` : id);

/**
 * Las líneas que se cobran: el carrito si viene (juntando la misma variante),
 * si no, el producto del formulario. Lo usan la cotización y el pedido.
 */
export function orderLines(dto: { variantId: string; qty: number; cart?: CartLine[] }): CartLine[] {
  if (!dto.cart?.length) return [{ variantId: VARIANT_GID(dto.variantId), qty: dto.qty }];
  const merged = new Map<string, number>();
  for (const l of dto.cart) {
    const id = VARIANT_GID(l.variantId);
    merged.set(id, (merged.get(id) ?? 0) + l.qty);
  }
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }));
}
