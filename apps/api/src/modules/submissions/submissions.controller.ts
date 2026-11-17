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
