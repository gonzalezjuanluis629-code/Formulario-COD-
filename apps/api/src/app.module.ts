import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { ShopifyModule } from './infra/shopify/shopify.module';
import { CryptoModule } from './shared/crypto/crypto.module';
import { FormsModule } from './modules/forms/forms.module';
import { QuoteModule } from './modules/quote/quote.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { LocationModule } from './modules/location/location.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),
    PrismaModule, RedisModule, CryptoModule, ShopifyModule,
    FormsModule, QuoteModule, DiscountsModule, LocationModule, SubmissionsModule, WebhooksModule, AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
