/**
 * Motor de precios. TODO en centavos (enteros). Nunca float con dinero.
 *
 * Pipeline determinista y abierta a extensión (Open/Closed):
 * añadir "BXGY" = añadir un PricingStep, sin tocar los demás.
 * El widget la usa para previsualizar; el SERVIDOR la usa como verdad.
 */
import type { Offer, QuoteResponse } from '@cod/contracts';

export interface PricingContext {
  qty: number;
  unitPriceCents: number;
  currency: string;
  offers: Offer[];
  defaultShippingCents: number;
  freeShippingOverCents: number | null;
  /** Tarifa de la provincia declarada, si existe (ya resuelta). Null = usa default. */
  provinceShippingCents?: number | null;
  /** Recargo contra entrega (COD fee). */
  codFeeCents?: number;
  /** Descuento ya validado (en Shopify o en la app). */
  discount: ValidatedDiscount | null;
  /** Precio total de los addons aceptados (order bumps + upsells), en centavos. */
  addonsCents?: number;
  /** Carrito con varios productos: suma de las ofertas por cantidad de cada línea. */
  lineOffers?: { discountCents: number; freeShipping: boolean; label: string | null } | null;
  /** Cupón solo para algunos productos: lo que suman esos productos (base del descuento). */
  discountBaseCents?: number | null;
}

export interface ValidatedDiscount {
  code: string;
  source: 'SHOPIFY' | 'APP';
  label: string;
  kind: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING';
  /** basis points (1000 = 10 %) si es PERCENTAGE */
  valueBps?: number;
  /** centavos si es FIXED */
  valueCents?: number;
  /** Productos en los que vale (gid://shopify/Product/…). Vacío o ausente = todos. */
  productIds?: string[];
}

interface Draft {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  addonsCents: number;
  codFeeCents: number;
  freeShipping: boolean;
  appliedOffer: string | null;
}

export interface PricingStep {
  readonly name: string;
  apply(d: Draft, ctx: PricingContext): void;
}

/* 1 — Subtotal */
const subtotal: PricingStep = {
  name: 'subtotal',
  apply(d, ctx) {
    d.subtotalCents = ctx.unitPriceCents * ctx.qty;
  },
};

/**
 * Descuento de la oferta por cantidad que toca a una línea (un producto):
 * gana la de mayor minQty aplicable. Se usa también línea a línea en el carrito.
 */
export function offerDiscount(qty: number, unitPriceCents: number, offers: Offer[]):
  { discountCents: number; freeShipping: boolean; label: string | null } {
  const subtotal = unitPriceCents * qty;
  const match = offers
    .filter((o) => qty >= o.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (!match) return { discountCents: 0, freeShipping: false, label: null };

  let discount = 0;
  if (match.bundlePriceCents != null && unitPriceCents > 0) {
    // Precio fijo del paquete: «2 por RD$ 2,950». Se reparte proporcionalmente
    // si el cliente lleva más unidades que el mínimo del paquete.
    const full = unitPriceCents * match.minQty;
    const rate = full > 0 ? Math.max(0, 1 - match.bundlePriceCents / full) : 0;
    discount = Math.round(subtotal * rate);
  } else if (match.discountCents > 0) {
    // Monto fijo: «llévate 2 y ahorra RD$ 200».
    discount = Math.min(match.discountCents, subtotal);
  } else if (match.discountBps > 0) {
    discount = Math.round((subtotal * match.discountBps) / 10000);
  }
  // Una oferta que no rebaja nada (ni da envío gratis) no cuenta como aplicada.
  if (discount <= 0 && !match.freeShipping) return { discountCents: 0, freeShipping: false, label: null };
  return { discountCents: discount, freeShipping: match.freeShipping, label: match.label };
}

/* 2 — Ofertas por cantidad ("compra 2, 10 % off"). */
const quantityOffers: PricingStep = {
  name: 'quantity-offers',
  apply(d, ctx) {
    const r = offerDiscount(ctx.qty, ctx.unitPriceCents, ctx.offers);
    // Carrito con varios productos: las ofertas ya se calcularon línea a línea.
    const x = ctx.lineOffers;
    d.discountCents += r.discountCents + (x?.discountCents ?? 0);
    if (r.freeShipping || x?.freeShipping) d.freeShipping = true;
    d.appliedOffer = r.label ?? x?.label ?? null;
  },
};

/* 3 — Cupón / descuento automático (ya validado por DiscountService) */
const discounts: PricingStep = {
  name: 'discounts',
  apply(d, ctx) {
    const x = ctx.discount;
    if (!x) return;
    // Cupón de algunos productos: se calcula solo sobre lo que suman esos productos.
    const base = ctx.discountBaseCents != null ? Math.min(ctx.discountBaseCents, d.subtotalCents) : d.subtotalCents;
    if (x.kind === 'PERCENTAGE' && x.valueBps) {
      d.discountCents += Math.round((base * x.valueBps) / 10000);
    } else if (x.kind === 'FIXED' && x.valueCents) {
      d.discountCents += Math.min(x.valueCents, base);
    } else if (x.kind === 'FREE_SHIPPING') {
      d.freeShipping = true;
    }
    // El descuento nunca puede superar el subtotal.
    d.discountCents = Math.min(d.discountCents, d.subtotalCents);
  },
};

/* 4 — Envío. Usa la tarifa de la provincia declarada; si no hay, la default.
 * El envío gratis por umbral gana sobre la tarifa provincial. */
const shipping: PricingStep = {
  name: 'shipping',
  apply(d, ctx) {
    const goods = d.subtotalCents - d.discountCents + d.addonsCents;
    const free =
      d.freeShipping ||
      (ctx.freeShippingOverCents !== null && goods >= ctx.freeShippingOverCents);
    const base = ctx.provinceShippingCents ?? ctx.defaultShippingCents;
    d.shippingCents = free ? 0 : base;
  },
};

/* 5 — Addons (order bumps / upsells). Suman al total; el envío gratis por
 * umbral también los cuenta, porque suben el valor del pedido. */
const addons: PricingStep = {
  name: 'addons',
  apply(d, ctx) {
    d.addonsCents = ctx.addonsCents ?? 0;
  },
};

/* 6 — COD fee: recargo por pagar contra entrega. Se suma al final. */
const codFee: PricingStep = {
  name: 'cod-fee',
  apply(d, ctx) {
    d.codFeeCents = ctx.codFeeCents ?? 0;
  },
};

// Orden: addons antes que shipping para que cuenten en el envío gratis.
export const PIPELINE: PricingStep[] = [subtotal, quantityOffers, discounts, addons, shipping, codFee];

export function quote(ctx: PricingContext): QuoteResponse {
  const d: Draft = {
    subtotalCents: 0,
    discountCents: 0,
    shippingCents: 0,
    addonsCents: 0,
    codFeeCents: 0,
    freeShipping: false,
    appliedOffer: null,
  };

  for (const step of PIPELINE) step.apply(d, ctx);

  return {
    subtotalCents: d.subtotalCents,
    discountCents: d.discountCents,
    shippingCents: d.shippingCents,
    addonsCents: d.addonsCents,
    codFeeCents: d.codFeeCents,
    totalCents:
      d.subtotalCents - d.discountCents + d.addonsCents + d.shippingCents + d.codFeeCents,
    currency: ctx.currency,
    appliedOffer: d.appliedOffer,
    appliedDiscount: ctx.discount
      ? { code: ctx.discount.code, source: ctx.discount.source, label: ctx.discount.label }
      : null,
  };
}

/** RD$ 1,890 · con centavos siempre dos cifras: RD$ 1,806.50 (nunca «1,806.5»). */
export const money = (cents: number, currency = 'DOP') => {
  const frac = Math.round(cents) % 100 !== 0 ? 2 : 0;
  return `${currency === 'DOP' ? 'RD$' : currency} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: 2 })}`;
};
