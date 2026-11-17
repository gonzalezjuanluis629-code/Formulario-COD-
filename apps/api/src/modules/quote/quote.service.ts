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
    // Lo que suma cada producto (para los cupones que valen solo en algunos).
    let byProduct: { productId: string; cents: number }[];
    const [only] = lines;
    if (lines.length === 1 && only) {
      qty = only.qty;
      const v = await this.variant(ctx, only.variantId);
      unitPriceCents = v.priceCents;
      byProduct = [{ productId: v.productId, cents: v.priceCents * qty }];
      const offers = await this.prisma.offer.findMany({
        where: { shopId: ctx.shopId, active: true, type: 'QUANTITY' },
        orderBy: { priority: 'desc' },
      });
      parsed = offers
        .map((o) => OfferSchema.parse({ id: o.id, label: o.name, type: 'QUANTITY', ...(o.payload as object) }))
        // Ofertas de otros productos no cuentan.
        .filter((o) => !o.productIds.length || o.productIds.includes(v.productId));
    } else {
      qty = 1;
      byProduct = await this.cartPrices(ctx, lines);
      unitPriceCents = byProduct.reduce((s, l) => s + l.cents, 0);
    }

    let discount = await this.discounts.validate(ctx, dto.discountCode ?? null);
    let discountBaseCents: number | null = null;
    if (discount?.productIds?.length) {
      const ids = new Set(discount.productIds);
      discountBaseCents = byProduct.filter((l) => ids.has(l.productId)).reduce((s, l) => s + l.cents, 0);
      // El cupón es de otros productos: aquí no vale (el formulario avisa «código no válido»).
      if (discountBaseCents === 0) { discount = null; discountBaseCents = null; }
    }

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
      discountBaseCents,
      addonsCents,
    });
  }

  /** Cada línea del carrito con el precio real de su variante en Shopify (× cantidad). */
  private async cartPrices(ctx: ShopContext, lines: CartLine[]): Promise<{ productId: string; cents: number }[]> {
    type Node = { id: string; price?: string; product?: { id: string } } | null;
    const data = await this.admin.graphql<{ nodes: Node[] }>(
      ctx, `query($ids: [ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id price product { id } } } }`,
      { ids: lines.map((l) => l.variantId) },
    );
    const byId = new Map(data.nodes.filter((n): n is NonNullable<Node> => !!n?.price).map((n) => [n.id, n]));
    return lines.map((l) => {
      const n = byId.get(l.variantId);
      if (!n?.price) throw new NotFoundException('Un producto del carrito ya no está disponible. Recarga la página.');
      return { productId: n.product?.id ?? '', cents: Math.round(parseFloat(n.price) * 100) * l.qty };
    });
  }

  /** Precio real de la variante y su producto. */
  private async variant(ctx: ShopContext, variantId: string): Promise<{ priceCents: number; productId: string }> {
    const data = await this.admin.graphql<{
      productVariant: { price: string; availableForSale: boolean; product: { id: string } | null } | null;
    }>(ctx, `query($id: ID!){ productVariant(id:$id){ price availableForSale product { id } } }`, { id: variantId });

    if (!data.productVariant) throw new NotFoundException('Variante no encontrada');
    return { priceCents: Math.round(parseFloat(data.productVariant.price) * 100), productId: data.productVariant.product?.id ?? '' };
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
