import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { AppProxyGuard } from '../../shared/guards/app-proxy.guard';
import { Shop } from '../../shared/shop.decorator';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { FormsService } from './forms.service';

@Controller('apps/cod/form')
@UseGuards(AppProxyGuard)
export class FormsController {
  constructor(private forms: FormsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  resolve(
    @Shop() ctx: ShopContext,
    @Query('productId') productId: string,
    @Query('variantId') variantId: string,
  ) {
    return this.forms.resolve(ctx, productId, variantId);
  }
}
