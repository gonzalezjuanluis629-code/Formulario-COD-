import { Injectable } from '@nestjs/common';
import type { Addon, AcceptedAddon } from '@cod/contracts';
import { AddonSchema } from '@cod/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminClientService } from '../../infra/shopify/admin-client.service';
import type { ShopContext } from '../../infra/shopify/shop-context.service';

/**
 * Order bumps, upsells y downsells.
 *
 * Se guardan como filas Offer (type UPSELL / ORDER_BUMP / DOWNSELL), así que
 * no hizo falta migración. El precio que muestra el widget es informativo:
 * a la hora de cobrar, este servicio RE-LEE el precio real de cada variante en
 * Shopify. Nadie compra un addon de RD$5.000 por RD$1 editando el DOM.
 */
@Injectable()
export class AddonsService {
  constructor(private prisma: PrismaService, private admin: AdminClientService) {}

  /** Los addons configurados para la tienda, listos para el widget. */
  async list(ctx: ShopContext): Promise<Addon[]> {
    const rows = await this.prisma.offer.findMany({
      where: { shopId: ctx.shopId, active: true, type: { in: ['UPSELL', 'ORDER_BUMP', 'DOWNSELL'] } },
      orderBy: { priority: 'desc' },
    });
    return rows.map((r) => AddonSchema.parse({ id: r.id, ...(r.payload as object) }));
  }

  /**
   * Convierte los addons ACEPTADOS por el cliente en líneas de pedido,
   * verificando contra Shopify que la variante existe y a qué precio.
   * Devuelve también el total en centavos, que alimenta el pricing.
   */
  async resolve(
    ctx: ShopContext,
    acceptedIds: string[],
  ): Promise<{ lineItems: { variantId: string; qty: number }[]; totalCents: number; accepted: AcceptedAddon[] }> {
    if (!acceptedIds.length) return { lineItems: [], totalCents: 0, accepted: [] };

    const rows = await this.prisma.offer.findMany({
      where: {
        shopId: ctx.shopId, active: true,
        id: { in: acceptedIds },
        type: { in: ['UPSELL', 'ORDER_BUMP', 'DOWNSELL'] },
      },
    });

    const addons = rows.map((r) => AddonSchema.parse({ id: r.id, ...(r.payload as object) }));
    const lineItems: { variantId: string; qty: number }[] = [];
    const accepted: AcceptedAddon[] = [];
    let totalCents = 0;

    for (const a of addons) {
      const price = await this.variantPrice(ctx, a.variantId);
      if (price === null) continue; // variante borrada o sin stock: se ignora, no rompe el pedido
      lineItems.push({ variantId: a.variantId, qty: a.qty });
      accepted.push({ id: a.id, variantId: a.variantId, qty: a.qty });
      totalCents += price * a.qty;

      // Métrica de take-rate.
      await this.prisma.offer.update({
        where: { id: a.id },
        data: { accepts: { increment: 1 }, revenue: { increment: (price * a.qty) / 100 } },
      }).catch(() => undefined);
    }

    return { lineItems, totalCents, accepted };
  }

  private async variantPrice(ctx: ShopContext, variantId: string): Promise<number | null> {
    try {
      const data = await this.admin.graphql<{
        productVariant: { price: string } | null;
      }>(ctx, `query($id:ID!){ productVariant(id:$id){ price } }`, { id: variantId });
      if (!data.productVariant) return null;
      return Math.round(parseFloat(data.productVariant.price) * 100);
    } catch {
      return null;
    }
  }
}
