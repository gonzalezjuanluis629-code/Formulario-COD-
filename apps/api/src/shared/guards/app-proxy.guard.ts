import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { ShopContextService } from '../../infra/shopify/shop-context.service';
import { CryptoService } from '../crypto/crypto.service';

/**
 * Shopify firma cada request que pasa por el App Proxy.
 * Esto nos da dos cosas gratis:
 *   1. Sabemos con certeza de QUÉ tienda viene (sin confiar en el cliente).
 *   2. No necesitamos CORS abierto ni tokens en el navegador.
 *
 * Camino A: el secreto depende de la tienda, así que primero se lee `shop`
 * del query y se resuelve la app custom correspondiente.
 */
@Injectable()
export class AppProxyGuard implements CanActivate {
  constructor(private shops: ShopContextService, private crypto: CryptoService) {}

  async canActivate(exec: ExecutionContext): Promise<boolean> {
    const req = exec.switchToHttp().getRequest();
    const q = { ...req.query } as Record<string, string>;
    const signature = q.signature;
    if (!signature || !q.shop) throw new UnauthorizedException('Falta la firma del proxy');

    const ctx = await this.shops.byDomain(q.shop);

    delete q.signature;
    const message = Object.keys(q)
      .sort()
      .map((k) => `${k}=${Array.isArray(q[k]) ? (q[k] as unknown as string[]).join(',') : q[k]}`)
      .join('');

    const digest = crypto.createHmac('sha256', ctx.clientSecret).update(message).digest('hex');
    if (!this.crypto.safeEqual(digest, signature)) {
      throw new UnauthorizedException('Firma del proxy inválida');
    }

    req.shopCtx = ctx; // el resto de la app ya sabe de qué tienda habla
    return true;
  }
}
