import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { WebhookGuard } from '../../shared/guards/webhook.guard';
import { Shop } from '../../shared/shop.decorator';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
@UseGuards(WebhookGuard)
export class WebhooksController {
  constructor(private svc: WebhooksService) {}

  /** Shopify reintenta si no respondemos 200 rápido: procesamos en background. */
  @Post()
  @HttpCode(200)
  async handle(
    @Shop() ctx: ShopContext,
    @Headers('x-shopify-topic') topic: string,
    @Body() body: Record<string, unknown>,
  ) {
    void this.svc.process(ctx, topic, body); // fire-and-forget deliberado
    return { ok: true };
  }
}
