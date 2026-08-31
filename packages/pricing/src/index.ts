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

/* 2 — Ofertas por cantidad ("compra 2, 10 % off"). Gana la de mayor minQty aplicable. */
const quantityOffers: PricingStep = {
  name: 'quantity-offers',
  apply(d, ctx) {
    const match = ctx.offers
      .filter((o) => ctx.qty >= o.minQty)
      .sort((a, b) => b.minQty - a.minQty)[0];
    if (!match) return;

    if (match.discountBps > 0) {
      d.discountCents += Math.round((d.subtotalCents * match.discountBps) / 10000);
    }
    if (match.freeShipping) d.freeShipping = true;
    d.appliedOffer = match.label;
  },
};

/* 3 — Cupón / descuento automático (ya validado por DiscountService) */
const discounts: PricingStep = {
  name: 'discounts',
  apply(d, ctx) {
    const x = ctx.discount;
    if (!x) return;
    if (x.kind === 'PERCENTAGE' && x.valueBps) {
      d.discountCents += Math.round((d.subtotalCents * x.valueBps) / 10000);
    } else if (x.kind === 'FIXED' && x.valueCents) {
      d.discountCents += x.valueCents;
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

export const money = (cents: number, currency = 'DOP') =>
  `${currency === 'DOP' ? 'RD$' : currency} ${(cents / 100).toLocaleString('en-US')}`;
