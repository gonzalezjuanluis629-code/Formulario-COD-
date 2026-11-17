import '@shopify/shopify-app-react-router/adapters/node';
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from '@shopify/shopify-app-react-router/server';
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import { db } from './db.server';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.July25,
  scopes: process.env.SHOPIFY_SCOPES!.split(','),
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: '/auth',
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,

  hooks: {
    afterAuth: async ({ session, admin }) => {
      await provisionShop(session, admin);
    },
  },
});

type AdminGraphql = { graphql: (query: string) => Promise<Response> };
type ShopSession = { shop: string; scope?: string; accessToken?: string };

const provisioning = new Map<string, Promise<{ id: string }>>();

/**
 * Registra (o repara) la tienda en la base de datos: datos básicos, token
 * cifrado, secreto de la app y formulario inicial. Idempotente.
 *
 * Se llama desde afterAuth y TAMBIÉN desde requireShop cuando la tienda no
 * existe: al abrir la app Shopify lanza varias peticiones a la vez y alguna
 * podía buscar la tienda antes de que afterAuth terminara («No Shop found»).
 */
export function provisionShop(session: ShopSession, admin: AdminGraphql): Promise<{ id: string }> {
  const running = provisioning.get(session.shop);
  if (running) return running;
  const p = doProvision(session, admin).finally(() => provisioning.delete(session.shop));
  provisioning.set(session.shop, p);
  return p;
}

async function doProvision(session: ShopSession, admin: AdminGraphql): Promise<{ id: string }> {
  const { encryptForShop } = await import('./lib/crypto.server');

  const app = await db.shopifyApp.findUniqueOrThrow({
    where: { clientId: process.env.SHOPIFY_API_KEY! },
  });

  const res = await admin.graphql(
    `#graphql
     query { shop { name email currencyCode ianaTimezone billingAddress { countryCodeV2 } } }`,
  );
  const { data } = (await res.json()) as {
    data: { shop: { name: string; email: string; currencyCode: string; ianaTimezone: string; billingAddress: { countryCodeV2: string } | null } };
  };
  const s = data.shop;

  const upsert = () => db.shop.upsert({
    where: { domain: session.shop },
    update: { uninstalledAt: null, scopes: session.scope ?? '', shopifyAppId: app.id },
    create: {
      domain: session.shop,
      shopifyAppId: app.id,
      accessTokenEnc: Buffer.alloc(0),
      scopes: session.scope ?? '',
      name: s.name,
      email: s.email,
      currency: s.currencyCode,
      countryCode: s.billingAddress?.countryCodeV2 ?? 'DO',
      timezone: s.ianaTimezone,
      settings: {},
    },
  });
  // Si otro servidor la creó a la vez, el segundo intento ya es una actualización.
  const shop = await upsert().catch(() => upsert());

  await db.shop.update({
    where: { id: shop.id },
    data: { accessTokenEnc: encryptForShop(shop.id, session.accessToken!) },
  });

  await db.shopifyApp.update({
    where: { id: app.id },
    data: {
      // Clave ligada a la APP (no a la tienda): la misma app puede estar
      // instalada en varias tiendas y todas deben poder verificar el proxy.
      clientSecretEnc: encryptForShop(`app:${app.id}`, process.env.SHOPIFY_API_SECRET!),
    },
  });

  await ensureDefaults(shop.id);
  return { id: shop.id };
}

async function ensureDefaults(shopId: string) {
  const exists = await db.form.findFirst({ where: { shopId } });
  if (exists) return;

  const { DEFAULT_FIELDS } = await import('./lib/defaults');

  const theme = await db.theme.create({
    data: { shopId, name: 'Tema por defecto', isDefault: true, tokens: {} },
  });

  const form = await db.form.create({
    data: {
      shopId, name: 'Formulario COD', status: 'DRAFT', themeId: theme.id,
      assignments: { create: { type: 'ALL', priority: 0 } },
    },
  });

  const version = await db.formVersion.create({
    data: { formId: form.id, version: 1, schema: DEFAULT_FIELDS as object, publishedAt: new Date() },
  });

  await db.form.update({ where: { id: form.id }, data: { currentVersionId: version.id } });
}

export default shopify;
export const authenticate = shopify.authenticate;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
