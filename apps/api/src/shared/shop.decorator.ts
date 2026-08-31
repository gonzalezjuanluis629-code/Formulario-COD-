import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ShopContext } from '../infra/shopify/shop-context.service';

export const Shop = createParamDecorator(
  (_d: unknown, exec: ExecutionContext): ShopContext => exec.switchToHttp().getRequest().shopCtx,
);
