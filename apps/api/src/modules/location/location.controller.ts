import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ReverseGeocodeRequestSchema } from '@cod/contracts';
import { AppProxyGuard } from '../../shared/guards/app-proxy.guard';
import { ZodPipe } from '../../shared/zod.pipe';
import { Shop } from '../../shared/shop.decorator';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { LocationService } from './location.service';

@Controller('apps/cod/geo')
@UseGuards(AppProxyGuard)
export class LocationController {
  constructor(private location: LocationService) {}

  /** El widget nunca llama a Google. Llama aquí. Así la key no se filtra. */
  @Post('reverse')
  reverse(
    @Shop() ctx: ShopContext,
    @Body(new ZodPipe(ReverseGeocodeRequestSchema)) dto: { lat: number; lng: number },
  ) {
    return this.location.reverse(ctx, dto.lat, dto.lng);
  }
}
