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
   * Convierte los extras ACEPTADOS por el cliente en líneas del pedido.
   * - Con producto: se cobra el precio especial configurado en el panel (si lo
   *   hay) o, si no, el precio real de la variante en Shopify.
   * - Sin producto (cargo, p. ej. «Envío express»): se cobra el precio del panel.
   * El precio NUNCA sale del navegador: solo de la configuración del servidor.
   */
  async resolve(
    ctx: ShopContext,
    acceptedIds: string[],
  ): Promise<{
    lineItems: { variantId: string; qty: number; priceCents: number }[];
    charges: { title: string; priceCents: number }[];
    totalCents: number;
    accepted: (AcceptedAddon & { title: string; priceCents: number })[];
  }> {
    const empty = { lineItems: [], charges: [], totalCents: 0, accepted: [] };
    if (!acceptedIds.length) return empty;

    const rows = await this.prisma.offer.findMany({
      where: {
        shopId: ctx.shopId, active: true,
        id: { in: acceptedIds },
        type: { in: ['UPSELL', 'ORDER_BUMP', 'DOWNSELL'] },
      },
    });

    const addons = rows.map((r) => AddonSchema.parse({ id: r.id, ...(r.payload as object) }));
    const out: Awaited<ReturnType<AddonsService['resolve']>> = { lineItems: [], charges: [], totalCents: 0, accepted: [] };

    for (const a of addons) {
      let price: number | null;
      if (a.variantId) {
        price = a.priceCents > 0 ? a.priceCents : await this.variantPrice(ctx, a.variantId);
        if (price === null) continue; // variante borrada: se ignora, no rompe el pedido
        out.lineItems.push({ variantId: a.variantId, qty: a.qty, priceCents: price });
      } else {
        if (!(a.priceCents > 0)) continue;
        price = a.priceCents;
        out.charges.push({ title: plainTitle(a.title), priceCents: price * a.qty });
      }
      out.accepted.push({ id: a.id, variantId: a.variantId, qty: a.qty, title: plainTitle(a.title), priceCents: price });
      out.totalCents += price * a.qty;

      // Métrica de take-rate.
      await this.prisma.offer.update({
        where: { id: a.id },
        data: { accepts: { increment: 1 }, revenue: { increment: (price * a.qty) / 100 } },
      }).catch(() => undefined);
    }
    return out;
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

/** «Agrega una **ESTACIÓN** por {precio}» → «Agrega una ESTACIÓN» (para el pedido de Shopify). */
function plainTitle(t: string): string {
  return t.replace(/\*\*/g, '').replace(/\s*(por solo|por)?\s*\{precio\}/gi, '').trim() || 'Extra';
}
