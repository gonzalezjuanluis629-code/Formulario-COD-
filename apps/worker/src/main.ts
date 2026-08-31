import pino from 'pino';
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
async function tick() {
  try {
    await processOutbox(prisma, log);
    await processCapiOutbox(prisma, log);
  } catch (e) {
    log.error({ err: e }, 'Error en el ciclo del outbox');
  }
}

async function main() {
  log.info('Worker COD arrancado');
  setInterval(() => void tick(), 2000);

  const shutdown = async () => {
    log.info('Cerrando worker…');
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
void main();
