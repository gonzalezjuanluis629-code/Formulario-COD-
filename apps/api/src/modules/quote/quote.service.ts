import { Injectable, NotFoundException } from '@nestjs/common';
import type { QuoteRequest, QuoteResponse, Offer, CartLine } from '@cod/contracts';
import { ShopSettingsSchema, OfferSchema, provinceAllows } from '@cod/contracts';
import { quote as runPricing, offerDiscount } from '@cod/pricing';
import { PageOffersService } from '../page-offers/page-offers.service';
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
    private pageOffers: PageOffersService,
  ) {}

  async compute(ctx: ShopContext, dto: QuoteRequest): Promise<QuoteResponse> {
    return (await this.computeDetailed(ctx, dto)).quote;
  }

  /**
   * Cotización + las líneas que se cobran. Desde el carrito: se cobra el TOTAL
   * DEL CARRITO de la tienda (con sus descuentos y combos), leído por el
   * servidor con el token del carrito; el formulario no aplica ofertas propias.
   */
  async computeDetailed(ctx: ShopContext, dto: QuoteRequest): Promise<{ quote: QuoteResponse; lines: CartLine[]; cartVerified: boolean }> {
    let cartVerified = true;
    const settings = { ...ShopSettingsSchema.parse(ctx.settings ?? {}), ...(ctx.currency ? { currency: ctx.currency } : {}) };
    const lines = orderLines(dto);

    // Un solo producto (aunque venga del carrito): precio × cantidad y las
    // ofertas por cantidad aplican. Varios productos: la suma de cada línea
    // con su precio real; las ofertas por cantidad son de un producto, no aplican.
    let qty: number;
    let unitPriceCents: number;
    let parsed: Offer[] = [];
    let lineOffers: { discountCents: number; freeShipping: boolean; label: string | null } | null = null;
    // Lo que suma cada producto (para los cupones que valen solo en algunos).
    let byProduct: { productId: string; cents: number }[];
    const shopOffers = (await this.prisma.offer.findMany({
      where: { shopId: ctx.shopId, active: true, type: 'QUANTITY' },
      orderBy: { priority: 'desc' },
    })).map((o) => OfferSchema.parse({ id: o.id, label: o.name, type: 'QUANTITY', ...(o.payload as object) }));
    // Ofertas de un producto: las de su página (si la tienda tiene su propia caja
    // de ofertas, esos precios mandan) o, si no, las del panel para ese producto.
    const offersFor = async (productId: string, unit: number): Promise<Offer[]> => {
      const fromPage = await this.pageOffers.forProduct(ctx, productId, unit);
      if (fromPage.length) return fromPage;
      // Solo las de ese producto y las que se ofrecen en la provincia del cliente.
      return shopOffers.filter((o) => (!o.productIds.length || o.productIds.includes(productId))
        && provinceAllows(o.provinces, dto.province ?? null));
    };

    const [only] = lines;
    if (dto.cart?.length) {
      const c = await this.cartTotals(ctx, dto, lines);
      lines.splice(0, lines.length, ...c.lines);
      cartVerified = c.verified;
      qty = 1;
      byProduct = c.byProduct;
      unitPriceCents = c.originalCents;
      lineOffers = { discountCents: c.discountCents, freeShipping: false, label: c.discountCents > 0 ? 'Descuento del carrito' : null };
    } else if (lines.length === 1 && only) {
      qty = only.qty;
      const v = await this.variant(ctx, only.variantId);
      unitPriceCents = v.priceCents;
      byProduct = [{ productId: v.productId, cents: v.priceCents * qty }];
      parsed = await offersFor(v.productId, v.priceCents);
    } else {
      // Carrito con varios productos: cada línea con su propia oferta por cantidad.
      qty = 1;
      const priced = await this.cartPrices(ctx, lines);
      byProduct = priced.map((l) => ({ productId: l.productId, cents: l.unitCents * l.qty }));
      unitPriceCents = byProduct.reduce((s, l) => s + l.cents, 0);
      lineOffers = { discountCents: 0, freeShipping: false, label: null };
      for (const l of priced) {
        const r = offerDiscount(l.qty, l.unitCents, await offersFor(l.productId, l.unitCents));
        lineOffers.discountCents += r.discountCents;
        if (r.freeShipping) lineOffers.freeShipping = true;
        if (r.label && !lineOffers.label) lineOffers.label = r.label;
      }
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
    // Tarifa de la provincia declarada. Si no hay una configurada, cae a la default.
    const province = dto.province ?? null;
    const { totalCents: addonsCents } = await this.addons.resolve(ctx, dto.addonIds ?? [], { province, track: false });
    const provinceShippingCents =
      province && settings.shippingByProvince[province] != null
        ? settings.shippingByProvince[province]
        : null;

    const quote = runPricing({
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
      lineOffers,
      addonsCents,
    });
    return { quote, lines, cartVerified };
  }

  /**
   * El carrito de la tienda: primero se lee de la propia tienda con su token
   * (precio de verdad, con los descuentos que la tienda le aplica). Si la tienda
   * no responde, se usa el total que vio el cliente solo si es razonable (entre
   * el 40 % y el 100 % de los precios reales); si no, los precios reales.
   */
  private async cartTotals(ctx: ShopContext, dto: QuoteRequest, lines: CartLine[]): Promise<{
    lines: CartLine[]; byProduct: { productId: string; cents: number }[]; originalCents: number; discountCents: number; verified: boolean;
  }> {
    const shopCart = dto.cartToken ? await this.readShopCart(ctx, dto.cartToken).catch(() => null) : null;
    if (shopCart && shopCart.items.length) {
      const original = shopCart.items.reduce((s, i) => s + i.original_line_price, 0);
      const total = Math.max(0, Math.min(shopCart.total_price, original));
      return {
        lines: mergeLines(shopCart.items.map((i) => ({ variantId: `gid://shopify/ProductVariant/${i.variant_id}`, qty: i.quantity }))),
        byProduct: shopCart.items.map((i) => ({ productId: `gid://shopify/Product/${i.product_id}`, cents: i.original_line_price })),
        originalCents: original,
        discountCents: original - total,
        verified: true,
      };
    }
    const priced = await this.cartPrices(ctx, lines);
    const original = priced.reduce((s, l) => s + l.unitCents * l.qty, 0);
    const seen = dto.cartTotalCents;
    const discount = seen != null && seen >= original * 0.4 && seen <= original ? original - seen : 0;
    return {
      lines,
      byProduct: priced.map((l) => ({ productId: l.productId, cents: l.unitCents * l.qty })),
      originalCents: original,
      discountCents: discount,
      verified: false,
    };
  }

  /** El carrito del cliente leído en la tienda (API del carrito con su token). */
  private async readShopCart(ctx: ShopContext, token: string): Promise<{
    token: string; total_price: number; items: { variant_id: number; product_id: number; quantity: number; original_line_price: number; final_line_price: number }[];
  } | null> {
    if (!/^[A-Za-z0-9._~?=&%-]{8,300}$/.test(token)) return null;
    const base = process.env.STOREFRONT_BASE_OVERRIDE || await this.primaryUrl(ctx);
    const res = await fetch(`${base.replace(/\/+$/, '')}/cart.js`, {
      headers: { Cookie: `cart=${token}`, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; CODForm/1.0)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const cart = await res.json().catch(() => null) as { token?: string; total_price?: number; items?: unknown[] } | null;
    if (!cart || typeof cart.total_price !== 'number' || !Array.isArray(cart.items)) return null;
    // Debe ser EL MISMO carrito (si no, la tienda devolvió uno nuevo y vacío).
    if (!cart.token || cart.token.split('?')[0] !== token.split('?')[0]) return null;
    return cart as never;
  }

  private primaryUrls = new Map<string, string>();
  private async primaryUrl(ctx: ShopContext): Promise<string> {
    const hit = this.primaryUrls.get(ctx.shopId);
    if (hit) return hit;
    const d = await this.admin.graphql<{ shop: { primaryDomain: { url: string } | null } }>(ctx, 'query { shop { primaryDomain { url } } }');
    const url = d.shop.primaryDomain?.url || `https://${ctx.domain}`;
    this.primaryUrls.set(ctx.shopId, url);
    return url;
  }

  /** Cada línea del carrito con el precio real de su variante en Shopify (× cantidad). */
  private async cartPrices(ctx: ShopContext, lines: CartLine[]): Promise<{ productId: string; unitCents: number; qty: number }[]> {
    type Node = { id: string; price?: string; product?: { id: string } } | null;
    const data = await this.admin.cachedGraphql<{ nodes: Node[] }>(
      ctx, `query($ids: [ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id price product { id } } } }`,
      { ids: lines.map((l) => l.variantId) },
    );
    const byId = new Map(data.nodes.filter((n): n is NonNullable<Node> => !!n?.price).map((n) => [n.id, n]));
    return lines.map((l) => {
      const n = byId.get(l.variantId);
      if (!n?.price) throw new NotFoundException('Un producto del carrito ya no está disponible. Recarga la página.');
      return { productId: n.product?.id ?? '', unitCents: Math.round(parseFloat(n.price) * 100), qty: l.qty };
    });
  }

  /** Precio real de la variante y su producto. */
  private async variant(ctx: ShopContext, variantId: string): Promise<{ priceCents: number; productId: string }> {
    const data = await this.admin.cachedGraphql<{
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
  return mergeLines(dto.cart);
}

function mergeLines(cart: CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const l of cart) {
    const id = VARIANT_GID(l.variantId);
    merged.set(id, (merged.get(id) ?? 0) + l.qty);
  }
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }));
}
