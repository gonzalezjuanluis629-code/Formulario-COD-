import { Injectable } from '@nestjs/common';
import type { TrackEvent } from '@cod/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { ShopContext } from '../../infra/shopify/shop-context.service';

/**
 * Embudo del formulario: view → start → submit → confirmed, y abandono.
 *
 * Se agrega directamente en AnalyticsDaily (una fila por tienda/formulario/día)
 * con incrementos atómicos. Sin tabla de eventos crudos que crezca sin control:
 * para el panel del merchant basta el agregado diario.
 */
@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async track(ctx: ShopContext, ev: TrackEvent): Promise<void> {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    const inc: Record<string, { increment: number }> = {};
    if (ev.event === 'view') inc.views = { increment: 1 };
    else if (ev.event === 'start') inc.starts = { increment: 1 };
    else if (ev.event === 'submit_attempt') inc.submissions = { increment: 1 };
    else if (ev.event === 'abandon') inc.abandoned = { increment: 1 };

    if (!Object.keys(inc).length) return;

    await this.prisma.analyticsDaily.upsert({
      where: { shopId_formId_date: { shopId: ctx.shopId, formId: ev.formId, date } },
      create: {
        shopId: ctx.shopId, formId: ev.formId, date,
        views: ev.event === 'view' ? 1 : 0,
        starts: ev.event === 'start' ? 1 : 0,
        submissions: ev.event === 'submit_attempt' ? 1 : 0,
        abandoned: ev.event === 'abandon' ? 1 : 0,
      },
      update: inc,
    });
  }

  /** Resumen para el dashboard: últimos N días. */
  async overview(ctx: ShopContext, days = 30) {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const rows = await this.prisma.analyticsDaily.findMany({
      where: { shopId: ctx.shopId, date: { gte: from } },
      orderBy: { date: 'asc' },
    });

    const totals = rows.reduce(
      (a, r) => ({
        views: a.views + r.views,
        starts: a.starts + r.starts,
        submissions: a.submissions + r.submissions,
        confirmed: a.confirmed + r.confirmed,
        abandoned: a.abandoned + r.abandoned,
        withGps: a.withGps + r.withGpsLocation,
        revenueCents: a.revenueCents + Number(r.revenueCents),
      }),
      { views: 0, starts: 0, submissions: 0, confirmed: 0, abandoned: 0, withGps: 0, revenueCents: 0 },
    );

    return {
      totals,
      daily: rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        views: r.views, starts: r.starts, submissions: r.submissions, confirmed: r.confirmed,
      })),
    };
  }
}
