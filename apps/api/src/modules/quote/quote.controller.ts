import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { QuoteRequestSchema, type QuoteRequest } from '@cod/contracts';
import { AppProxyGuard } from '../../shared/guards/app-proxy.guard';
import { ZodPipe } from '../../shared/zod.pipe';
import { Shop } from '../../shared/shop.decorator';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { QuoteService } from './quote.service';

@Controller('apps/cod/quote')
@UseGuards(AppProxyGuard)
export class QuoteController {
  constructor(private quote: QuoteService) {}

  @Post()
  compute(@Shop() ctx: ShopContext, @Body(new ZodPipe(QuoteRequestSchema)) dto: QuoteRequest) {
    return this.quote.compute(ctx, dto);
  }
}
