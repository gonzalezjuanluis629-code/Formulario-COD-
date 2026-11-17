import pino from 'pino';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { processOutbox } from './jobs/order-create';
import { processCapiOutbox } from './jobs/capi';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const prisma = new PrismaClient();

/**
 * Poller del Outbox.
 *
 * Cada 2 s coge los eventos vencidos y los procesa. Si Shopify está caído,
 * el evento vuelve a la cola con backoff exponencial. El pedido NO se pierde:
 * es exactamente el fallo que dejó a merchants de Releasit sin vender el 23 de
 * diciembre, y la razón por la que respondemos al cliente antes de llamar a Shopify.
 */
let running = false;
let again = false;
async function tick() {
  // Un ciclo a la vez; si llega un aviso mientras tanto, se repite al terminar.
  if (running) { again = true; return; }
  running = true;
  try {
    await processOutbox(prisma, log);
    await processCapiOutbox(prisma, log);
  } catch (e) {
    log.error({ err: e }, 'Error en el ciclo del outbox');
  } finally {
    running = false;
    if (again) { again = false; void tick(); }
  }
}

async function main() {
  log.info('Worker COD arrancado');
  // Pedido nuevo → la API avisa por Redis y se crea en Shopify AL INSTANTE.
  // Además se revisa la cola cada medio segundo (reintentos y por si el aviso no llega).
  if (process.env.REDIS_URL) {
    const sub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    sub.on('error', (e) => log.warn({ err: e.message }, 'Redis (avisos) no disponible'));
    void sub.subscribe('cod:outbox').then(() => log.info('Escuchando avisos de pedidos nuevos')).catch(() => undefined);
    sub.on('message', () => void tick());
  }
  setInterval(() => void tick(), 500);

  const shutdown = async () => {
    log.info('Cerrando worker…');
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
void main();
