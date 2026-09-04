/**
 * Seed. Registra la custom app y repara sus credenciales cifradas.
 *
 *   pnpm db:seed
 */
import { PrismaClient } from '@prisma/client';
import * as crypto from 'node:crypto';
import { DO_PROVINCES } from '../packages/geo/src/do';

const prisma = new PrismaClient();

function encrypt(shopId: string, plain: string): Buffer {
  const master = Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, 'base64');
  const key = Buffer.from(
    crypto.hkdfSync('sha256', master, Buffer.from(shopId), Buffer.from('cod-shop-key'), 32),
  );
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

async function main() {
  const app = await prisma.shopifyApp.upsert({
    where: { handle: process.env.SHOPIFY_APP_HANDLE! },
    update: {
      clientId: process.env.SHOPIFY_API_KEY!,
      scopes: process.env.SHOPIFY_SCOPES!,
      apiVersion: process.env.SHOPIFY_API_VERSION ?? '2025-07',
    },
    create: {
      handle: process.env.SHOPIFY_APP_HANDLE!,
      clientId: process.env.SHOPIFY_API_KEY!,
      clientSecretEnc: Buffer.alloc(0),
      scopes: process.env.SHOPIFY_SCOPES!,
      apiVersion: process.env.SHOPIFY_API_VERSION ?? '2025-07',
    },
  });

  const installedShop = await prisma.shop.findFirst({
    where: { shopifyAppId: app.id, uninstalledAt: null },
    select: { id: true },
  });
  if (installedShop && process.env.SHOPIFY_API_SECRET) {
    await prisma.shopifyApp.update({
      where: { id: app.id },
      data: { clientSecretEnc: encrypt(installedShop.id, process.env.SHOPIFY_API_SECRET) },
    });
  }

  console.log(`✓ ShopifyApp "${app.handle}" registrada`);
  console.log('  El accessToken y el clientSecret quedan cifrados por tienda.');

  const FIELDS = [
    { key: 'fullName', type: 'text', label: 'Nombre completo', placeholder: 'Tu nombre completo',
      required: true, width: '100', order: 1, validation: { minLength: 3, maxLength: 80, regex: null, message: null } },
    { key: 'phone', type: 'phone', label: 'WhatsApp', placeholder: '809 000 0000',
      required: true, width: '50', order: 2 },
    { key: 'email', type: 'email', label: 'Correo', placeholder: 'tucorreo@ejemplo.com',
      required: false, width: '50', order: 3 },
    { key: 'location', type: 'location', label: 'Dirección de entrega',
      required: true, width: '100', order: 4 },
    { key: 'province', type: 'select', label: 'Provincia', placeholder: 'Selecciona tu provincia',
      required: true, width: '100', order: 5,
      options: DO_PROVINCES.map((p) => ({ label: p.name, value: p.code })),
      conditions: [{ field: 'locationMode', op: 'eq', value: 'manual' }] },
    { key: 'address', type: 'textarea', label: 'Dirección',
      placeholder: 'Calle, número, sector y punto de referencia…',
      required: true, width: '100', order: 6,
      validation: { minLength: 5, maxLength: 300, regex: null, message: null },
      conditions: [{ field: 'locationMode', op: 'eq', value: 'manual' }] },
    { key: 'confirm', type: 'checkbox', content: 'Confirmo que recibiré mi pedido.',
      label: '', required: true, width: '100', order: 7 },
  ];

  console.log(`✓ Plantilla de formulario lista (${FIELDS.length} campos)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
