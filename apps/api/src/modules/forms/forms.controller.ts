import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AppProxyGuard } from '../../shared/guards/app-proxy.guard';
import { Shop } from '../../shared/shop.decorator';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { FormsService } from './forms.service';

@Controller('apps/cod/form')
@UseGuards(AppProxyGuard)
export class FormsController {
  constructor(private forms: FormsService) {}

  @Get()
  async resolve(
    @Shop() ctx: ShopContext,
    @Query('productId') productId: string,
    @Query('variantId') variantId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const form = await this.forms.resolve(ctx, productId, variantId);
    // Solo una respuesta buena se guarda en caché: un error pasajero del
    // servidor no puede dejar a los clientes sin botón durante minutos.
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return form;
  }
}
