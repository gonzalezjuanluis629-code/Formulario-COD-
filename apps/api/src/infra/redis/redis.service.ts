import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  /** Todas las claves llevan prefijo de tienda. Aislamiento multi-tenant real. */
  key(shopId: string, ...parts: string[]) {
    return `shop:${shopId}:${parts.join(':')}`;
  }

  /** Rate limit por ventana deslizante. Devuelve true si SE PERMITE. */
  /**
   * Límite de intentos. Si Redis no responde (caído o lento), se deja pasar:
   * un pedido nunca se pierde porque falle el contador.
   */
  async allow(key: string, limit: number, windowSec: number): Promise<boolean> {
    const check = (async () => {
      const n = await this.client.incr(key);
      if (n === 1) await this.client.expire(key, windowSec);
      return n <= limit;
    })();
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(true), 400));
    return Promise.race([check, timeout]).catch(() => true);
  }

  async onModuleDestroy() { await this.client.quit(); }
}
