import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { ShopContextService } from '../../infra/shopify/shop-context.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(private shops: ShopContextService, private crypto: CryptoService) {}

  async canActivate(exec: ExecutionContext): Promise<boolean> {
    const req = exec.switchToHttp().getRequest();
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const domain = req.get('X-Shopify-Shop-Domain');
    if (!hmac || !domain || !req.rawBody) throw new UnauthorizedException('Webhook sin firma');

    const ctx = await this.shops.byDomain(domain);
    const digest = crypto.createHmac('sha256', ctx.clientSecret).update(req.rawBody).digest('base64');
    if (!this.crypto.safeEqual(digest, hmac)) throw new UnauthorizedException('Webhook inválido');

    req.shopCtx = ctx;
    return true;
  }
}
