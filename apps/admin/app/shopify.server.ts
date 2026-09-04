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
      const { encryptForShop } = await import('./lib/crypto.server');

      const app = await db.shopifyApp.findUniqueOrThrow({
        where: { clientId: process.env.SHOPIFY_API_KEY! },
      });

      const res = await admin.graphql(
        `#graphql
         query { shop { name email currencyCode ianaTimezone billingAddress { countryCodeV2 } } }`,
      );
      const { data } = await res.json();
      const s = data.shop;

      const shop = await db.shop.upsert({
        where: { domain: session.shop },
        update: { uninstalledAt: null, scopes: session.scope ?? '' },
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

      await db.shop.update({
        where: { id: shop.id },
        data: { accessTokenEnc: encryptForShop(shop.id, session.accessToken!) },
      });

      await db.shopifyApp.update({
        where: { id: app.id },
        data: {
          clientSecretEnc: encryptForShop(shop.id, process.env.SHOPIFY_API_SECRET!),
        },
      });

      await ensureDefaults(shop.id);
    },
  },
});

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
    data: { formId: form.id, version: 1, schema: DEFAULT_FIELDS, publishedAt: new Date() },
  });

  await db.form.update({ where: { id: form.id }, data: { currentVersionId: version.id } });
}

export default shopify;
export const authenticate = shopify.authenticate;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
