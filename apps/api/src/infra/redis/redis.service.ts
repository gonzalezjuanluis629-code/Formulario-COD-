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
  async allow(key: string, limit: number, windowSec: number): Promise<boolean> {
    const n = await this.client.incr(key);
    if (n === 1) await this.client.expire(key, windowSec);
    return n <= limit;
  }

  async onModuleDestroy() { await this.client.quit(); }
}
