import { Module } from '@nestjs/common';
import { ShopifyModule } from '../../infra/shopify/shopify.module';
import { StorefrontController } from './storefront.controller';

@Module({ imports: [ShopifyModule], controllers: [StorefrontController] })
export class StorefrontModule {}
