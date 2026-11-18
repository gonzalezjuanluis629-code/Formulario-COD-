import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Más conexiones a la base de datos que las de fábrica: con muchos pedidos a la
 * vez no se forma fila esperando conexión. Si DATABASE_URL ya fija un tamaño,
 * se respeta (la variable no se toca).
 */
function withPool(url: string | undefined, limit: number): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}&pool_timeout=20`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: withPool(process.env.DATABASE_URL, Number(process.env.DB_POOL ?? 20)) } } });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
