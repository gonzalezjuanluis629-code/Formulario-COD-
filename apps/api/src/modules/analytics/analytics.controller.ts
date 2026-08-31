import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TrackEventSchema, type TrackEvent } from '@cod/contracts';
import { AppProxyGuard } from '../../shared/guards/app-proxy.guard';
import { ZodPipe } from '../../shared/zod.pipe';
import { Shop } from '../../shared/shop.decorator';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { AnalyticsService } from './analytics.service';

@Controller('apps/cod/track')
@UseGuards(AppProxyGuard)
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  /** Eventos de embudo desde el widget. Responde 204 rápido (no bloquea al cliente). */
  @Post()
  async track(@Shop() ctx: ShopContext, @Body(new ZodPipe(TrackEventSchema)) ev: TrackEvent) {
    void this.analytics.track(ctx, ev); // fire-and-forget
    return { ok: true };
  }
}
