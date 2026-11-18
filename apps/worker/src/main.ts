import pino from 'pino';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { processOutbox } from './jobs/order-create';
import { processCapiOutbox } from './jobs/capi';
import { withPool } from './pool';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const prisma = new PrismaClient({ datasources: { db: { url: withPool(process.env.DATABASE_URL, 10) } } });

/**
 * Poller del Outbox, con DOS carriles independientes:
 *  - Pedidos: lo primero y lo más rápido. Un aviso por Redis lo despierta al
 *    instante y crea varios pedidos en Shopify a la vez.
 *  - Píxel de Meta (CAPI): aparte, para que una llamada lenta a Meta nunca
 *    retrase un pedido.
 * Si Shopify está caído, el evento vuelve a la cola con backoff exponencial. El
 * pedido NO se pierde: respondemos al cliente antes de llamar a Shopify.
 */
function lane(name: string, work: () => Promise<number | void>) {
  let running = false;
  let again = false;
  const tick = async (): Promise<void> => {
    if (running) { again = true; return; }
    running = true;
    try {
      // Si el lote vino lleno, hay más esperando: se sigue sin pausa.
      for (let i = 0; i < 50; i++) {
        const n = await work();
        if (!n || n < 4) break;
      }
    } catch (e) {
      log.error({ err: e }, `Error en el carril ${name}`);
    } finally {
      running = false;
      if (again) { again = false; void tick(); }
    }
  };
  return tick;
}

const orders = lane('pedidos', () => processOutbox(prisma, log));
const capi = lane('capi', () => processCapiOutbox(prisma, log));

async function main() {
  log.info('Worker COD arrancado');
  // Pedido nuevo → la API avisa por Redis y se crea en Shopify AL INSTANTE.
  // Además se revisa la cola cada poco (reintentos y por si el aviso no llega).
  if (process.env.REDIS_URL) {
    const sub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    sub.on('error', (e) => log.warn({ err: e.message }, 'Redis (avisos) no disponible'));
    void sub.subscribe('cod:outbox').then(() => log.info('Escuchando avisos de pedidos nuevos')).catch(() => undefined);
    sub.on('message', () => { void orders(); setTimeout(() => void capi(), 1500); });
  }
  setInterval(() => void orders(), 400);
  setInterval(() => void capi(), 2000);

  const shutdown = async () => {
    log.info('Cerrando worker…');
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
void main();
