import { Global, Module } from '@nestjs/common';
import { ShopContextService } from './shop-context.service';
import { AdminClientService } from './admin-client.service';
import { OrderService } from './order.service';
import { AppProxyGuard } from '../../shared/guards/app-proxy.guard';
import { WebhookGuard } from '../../shared/guards/webhook.guard';

@Global()
@Module({
  providers: [ShopContextService, AdminClientService, OrderService, AppProxyGuard, WebhookGuard],
  exports: [ShopContextService, AdminClientService, OrderService, AppProxyGuard, WebhookGuard],
})
export class ShopifyModule {}
