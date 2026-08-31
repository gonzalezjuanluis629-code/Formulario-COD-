import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ShopContextService, type ShopContext } from '../../infra/shopify/shop-context.service';

@Injectable()
export class WebhooksService {
  private readonly log = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService, private shops: ShopContextService) {}

  async process(ctx: ShopContext, topic: string, body: Record<string, unknown>) {
    this.log.log(`Webhook ${topic} de ${ctx.domain}`);

    switch (topic) {
      case 'app/uninstalled':
        await this.prisma.shop.update({
          where: { id: ctx.shopId },
          data: { uninstalledAt: new Date() },
        });
        this.shops.invalidate(ctx.domain);
        break;

      /* ── Compliance obligatorio (Protected Customer Data) ── */
      case 'customers/redact': {
        const phone = (body.customer as { phone?: string })?.phone;
        if (phone) {
          await this.prisma.submission.updateMany({
            where: { shopId: ctx.shopId, phoneHash: phone },
            data: { customerDataEnc: null, latitude: null, longitude: null, geocodedAddress: undefined },
          });
        }
        break;
      }
      case 'shop/redact':
        await this.prisma.submission.deleteMany({ where: { shopId: ctx.shopId } });
        await this.prisma.shop.delete({ where: { id: ctx.shopId } });
        break;

      case 'customers/data_request':
        // Se atiende manualmente desde el panel dentro del plazo legal.
        this.log.warn(`Solicitud GDPR de datos en ${ctx.domain}`);
        break;

      case 'orders/cancelled':
        await this.prisma.submission.updateMany({
          where: { shopId: ctx.shopId, shopifyOrderId: String(body.admin_graphql_api_id ?? '') },
          data: { status: 'CANCELLED' },
        });
        break;
    }
  }
}
