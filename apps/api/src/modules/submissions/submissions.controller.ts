import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SubmitRequestSchema, type SubmitRequest } from '@cod/contracts';
import { AppProxyGuard } from '../../shared/guards/app-proxy.guard';
import { ZodPipe } from '../../shared/zod.pipe';
import { Shop } from '../../shared/shop.decorator';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { SubmitService } from './submit.service';
import { clientIp } from '../../shared/client-ip';

@Controller('apps/cod/submit')
@UseGuards(AppProxyGuard)
export class SubmissionsController {
  constructor(private submit: SubmitService) {}

  @Post()
  create(
    @Shop() ctx: ShopContext,
    @Body(new ZodPipe(SubmitRequestSchema)) dto: SubmitRequest,
    @Req() req: Request,
  ) {
    return this.submit.submit(ctx, dto, clientIp(req), req.get('user-agent') ?? '');
  }
}

/**
 * Enlace a la página «Estado del pedido» de Shopify, para llevar ahí al cliente
 * al terminar. El pedido lo crea el worker al momento, así que el formulario
 * pregunta unos segundos hasta que esté. Solo responde a quien tiene la clave
 * única del envío (la conoce únicamente el navegador que hizo el pedido).
 */
@Controller('apps/cod/order-status')
@UseGuards(AppProxyGuard)
export class OrderStatusController {
  constructor(private submit: SubmitService) {}

  @Post()
  status(@Shop() ctx: ShopContext, @Body() body: { submissionId?: unknown; key?: unknown }) {
    const id = typeof body?.submissionId === 'string' ? body.submissionId.slice(0, 64) : '';
    const key = typeof body?.key === 'string' ? body.key.slice(0, 100) : '';
    return this.submit.statusUrl(ctx, id, key);
  }
}
