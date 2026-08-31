import { Injectable, Logger } from '@nestjs/common';
import type { ValidatedDiscount } from '@cod/pricing';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminClientService } from '../../infra/shopify/admin-client.service';
import type { ShopContext } from '../../infra/shopify/shop-context.service';

/**
 * Estrategia acordada: valida primero contra los descuentos REALES de Shopify.
 * Si el código no existe allí, cae a los descuentos propios del panel.
 *
 * Así el merchant puede seguir usando sus cupones de siempre, y además crear
 * cupones exclusivos del formulario COD sin ensuciar el checkout nativo.
 */
@Injectable()
export class DiscountsService {
  private readonly log = new Logger(DiscountsService.name);

  constructor(private prisma: PrismaService, private admin: AdminClientService) {}

  async validate(ctx: ShopContext, code: string | null): Promise<ValidatedDiscount | null> {
    if (!code) return null;
    const clean = code.trim().toUpperCase();

    const fromShopify = await this.fromShopify(ctx, clean);
    if (fromShopify) return fromShopify;

    return this.fromApp(ctx, clean);
  }

  /* ── 1. Descuento nativo de Shopify ── */
  private async fromShopify(ctx: ShopContext, code: string): Promise<ValidatedDiscount | null> {
    try {
      const data = await this.admin.graphql<{
        codeDiscountNodeByCode: {
          codeDiscount:
            | {
                __typename: string;
                status?: string;
                title?: string;
                customerGets?: { value: Record<string, unknown> };
              }
            | null;
        } | null;
      }>(ctx, QUERY, { code });

      const d = data.codeDiscountNodeByCode?.codeDiscount;
      if (!d || d.status !== 'ACTIVE') return null;

      const v = d.customerGets?.value as
        | { percentage?: number; amount?: { amount: string } }
        | undefined;

      if (v?.percentage != null) {
        return {
          code, source: 'SHOPIFY', label: d.title ?? code,
          kind: 'PERCENTAGE',
          valueBps: Math.round(v.percentage * 10000), // 0.10 → 1000 bps
        };
      }
      if (v?.amount?.amount) {
        return {
          code, source: 'SHOPIFY', label: d.title ?? code,
          kind: 'FIXED',
          valueCents: Math.round(parseFloat(v.amount.amount) * 100),
        };
      }
      return null;
    } catch (e) {
      // Si Shopify falla, NO tumbamos la cotización: caemos a los de la app.
      this.log.warn(`No se pudo validar "${code}" en Shopify: ${(e as Error).message}`);
      return null;
    }
  }

  /* ── 2. Descuento propio del panel ── */
  private async fromApp(ctx: ShopContext, code: string): Promise<ValidatedDiscount | null> {
    const d = await this.prisma.discount.findFirst({
      where: {
        shopId: ctx.shopId, code, active: true,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
      },
    });
    if (!d) return null;
    if (d.usageLimit != null && d.usageCount >= d.usageLimit) return null;

    const p = d.payload as { valueBps?: number; valueCents?: number };
    if (d.type === 'PERCENTAGE') {
      return { code, source: 'APP', label: d.name, kind: 'PERCENTAGE', valueBps: p.valueBps ?? 0 };
    }
    if (d.type === 'FIXED') {
      return { code, source: 'APP', label: d.name, kind: 'FIXED', valueCents: p.valueCents ?? 0 };
    }
    if (d.type === 'FREE_SHIPPING') {
      return { code, source: 'APP', label: d.name, kind: 'FREE_SHIPPING' };
    }
    return null;
  }
}

const QUERY = /* GraphQL */ `
  query CodDiscountByCode($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      codeDiscount {
        __typename
        ... on DiscountCodeBasic {
          status
          title
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } }
            }
          }
        }
        ... on DiscountCodeFreeShipping { status title }
      }
    }
  }
`;
