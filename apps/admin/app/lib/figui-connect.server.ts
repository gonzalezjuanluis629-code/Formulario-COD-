import { ShopSettingsSchema } from '@cod/contracts';
import { db } from '../db.server';
import { figuiApp, shopifyGraphql, shopToken, ShopifyCallError } from './figui.server';
import { installInTheme, manualSnippet, removeFromTheme, themeStatus, ThemeAccessError } from './figui-theme.server';

/**
 * Lo que hace Figui (servidor→servidor) con el formulario de una tienda:
 * conectarla (con el acceso a Shopify que ya tiene Figui), ver su estado y
 * encender/apagar el formulario en la tienda.
 */

export const THEME_SCOPES = ['read_themes', 'write_themes'];

export type FiguiStatus = {
  shop: { domain: string; name: string | null; currency: string };
  /** «app»: la tienda ya usa la app de Shopify (extensión del tema); Figui no toca su tema. */
  managedBy: 'figui' | 'app';
  form: { id: string; name: string; status: string } | null;
  storefront: {
    autoPlace: boolean;
    floating: boolean;
    installed: boolean;
    themeName: string | null;
    canInstall: boolean;
    error: string | null;
  };
  manualSnippet: string;
};

export class FiguiError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Alta / actualización de la tienda con el token que manda Figui. */
export async function connectFromFigui(input: { shop: string; accessToken: string; scopes: string }) {
  const app = await figuiApp();
  const existing = await db.shop.findUnique({ where: { domain: input.shop }, include: { shopifyApp: true } });

  // SIEMPRE se comprueba que el acceso de Figui sigue valiendo en Shopify: sin
  // eso, una cuenta con una conexión vieja podría seguir entrando al editor.
  let info: { name: string; email: string; currencyCode: string; ianaTimezone: string; billingAddress: { countryCodeV2: string } | null };
  try {
    const data = await shopifyGraphql<{ shop: typeof info }>(input.shop, input.accessToken,
      'query { shop { name email currencyCode ianaTimezone billingAddress { countryCodeV2 } } }');
    info = data.shop;
  } catch (e) {
    if (e instanceof ShopifyCallError && e.accessDenied) throw new FiguiError('Shopify no aceptó el acceso de Figui. Reconecta Shopify en Figui.', 401);
    throw new FiguiError(`No se pudo leer la tienda en Shopify: ${(e as Error).message}`, 502);
  }

  // Si la tienda tiene instalada la app de Shopify, esa manda (su token y su
  // extensión del tema). Figui solo la edita, sin cambiar nada de su conexión.
  if (existing && !existing.uninstalledAt && existing.shopifyApp.handle !== 'figui' && existing.accessTokenEnc.length) {
    return existing;
  }

  const { encryptForShop } = await import('./crypto.server');
  const shop = await db.shop.upsert({
    where: { domain: input.shop },
    update: {
      shopifyAppId: app.id, uninstalledAt: null, scopes: input.scopes,
      name: info.name, email: info.email, currency: info.currencyCode,
      countryCode: info.billingAddress?.countryCodeV2 ?? 'DO', timezone: info.ianaTimezone,
    },
    create: {
      domain: input.shop, shopifyAppId: app.id, accessTokenEnc: Buffer.alloc(0), scopes: input.scopes,
      name: info.name, email: info.email, currency: info.currencyCode,
      countryCode: info.billingAddress?.countryCodeV2 ?? 'DO', timezone: info.ianaTimezone, settings: {},
    },
  });
  await db.shop.update({ where: { id: shop.id }, data: { accessTokenEnc: encryptForShop(shop.id, input.accessToken) } });

  const { ensureDefaults } = await import('../shopify.server');
  await ensureDefaults(shop.id);
  return db.shop.findUniqueOrThrow({ where: { id: shop.id }, include: { shopifyApp: true } });
}

const hasThemeScopes = (scopes: string) => {
  const set = new Set(scopes.split(',').map((s) => s.trim()));
  return set.has('write_themes');
};

export async function statusFor(domain: string): Promise<FiguiStatus> {
  const shop = await db.shop.findUnique({ where: { domain }, include: { shopifyApp: true } });
  if (!shop || shop.uninstalledAt) throw new FiguiError('La tienda no está conectada al formulario.', 404);
  const settings = ShopSettingsSchema.parse(shop.settings ?? {});
  const form = await db.form.findFirst({ where: { shopId: shop.id }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, status: true } });
  const managedBy = shop.shopifyApp.handle === 'figui' ? 'figui' : 'app';

  let installed = false;
  let themeName: string | null = null;
  let error: string | null = null;
  const canInstall = managedBy === 'figui' && hasThemeScopes(shop.scopes);
  if (canInstall) {
    try {
      const t = await themeStatus(domain, await shopToken(shop.id, shop.accessTokenEnc));
      installed = t.installed; themeName = t.themeName;
    } catch (e) {
      error = e instanceof ThemeAccessError ? e.message : 'No se pudo revisar el tema de la tienda.';
    }
  }

  return {
    shop: { domain, name: shop.name, currency: shop.currency },
    managedBy,
    form,
    storefront: { autoPlace: settings.storefront.autoPlace, floating: settings.storefront.floating, installed, themeName, canInstall, error },
    manualSnippet: manualSnippet(domain),
  };
}

/** Encender/apagar en la tienda y dónde sale el botón. */
export async function updateStorefront(domain: string, input: { enabled?: boolean; autoPlace?: boolean; floating?: boolean }) {
  const shop = await db.shop.findUnique({ where: { domain }, include: { shopifyApp: true } });
  if (!shop || shop.uninstalledAt) throw new FiguiError('La tienda no está conectada al formulario.', 404);

  if (typeof input.autoPlace === 'boolean' || typeof input.floating === 'boolean') {
    const current = ShopSettingsSchema.parse(shop.settings ?? {});
    const storefront = {
      autoPlace: input.autoPlace ?? current.storefront.autoPlace,
      floating: input.floating ?? current.storefront.floating,
    };
    await db.shop.update({ where: { id: shop.id }, data: { settings: { ...(shop.settings as object), storefront } } });
  }

  if (typeof input.enabled === 'boolean') {
    if (shop.shopifyApp.handle !== 'figui') {
      throw new FiguiError('Esta tienda usa la app de Shopify: el formulario se activa desde el editor del tema (Incrustaciones de aplicaciones).');
    }
    if (!hasThemeScopes(shop.scopes)) {
      throw new FiguiError('Falta el permiso de temas (write_themes) en la app de la tienda. Agrégalo y reconecta Shopify en Figui.', 403);
    }
    const token = await shopToken(shop.id, shop.accessTokenEnc);
    try {
      if (input.enabled) {
        // Sin formulario publicado la tienda no mostraría nada: se publica el actual.
        const form = await db.form.findFirst({ where: { shopId: shop.id }, orderBy: { createdAt: 'asc' } });
        if (form && form.status !== 'ACTIVE' && form.currentVersionId) await db.form.update({ where: { id: form.id }, data: { status: 'ACTIVE' } });
        await installInTheme(domain, token);
      } else {
        await removeFromTheme(domain, token);
      }
    } catch (e) {
      if (e instanceof ThemeAccessError) throw new FiguiError(e.message, e.missingScope ? 403 : 502);
      throw e;
    }
  }
  return statusFor(domain);
}

/** Productos o colecciones de la tienda (selector del editor dentro de Figui). */
export async function searchResources(shopId: string, domain: string, enc: Uint8Array, type: 'product' | 'collection', q: string) {
  const token = await shopToken(shopId, enc);
  const query = q.trim() ? `title:*${q.trim().replace(/[\\"]/g, '')}*` : '';
  if (type === 'collection') {
    const d = await shopifyGraphql<{ collections: { nodes: { id: string; title: string; image: { url: string } | null }[] } }>(
      domain, token,
      'query($q: String) { collections(first: 25, query: $q, sortKey: TITLE) { nodes { id title image { url } } } }', { q: query || null });
    return d.collections.nodes.map((c) => ({ id: c.id, title: c.title, image: c.image?.url ?? '', variants: [] as { id: string; title: string; price: string }[] }));
  }
  const d = await shopifyGraphql<{ products: { nodes: { id: string; title: string; featuredMedia: { preview: { image: { url: string } | null } | null } | null; variants: { nodes: { id: string; title: string; price: string }[] } }[] } }>(
    domain, token,
    'query($q: String) { products(first: 25, query: $q, sortKey: TITLE) { nodes { id title featuredMedia { preview { image { url } } } variants(first: 20) { nodes { id title price } } } } }', { q: query || null });
  return d.products.nodes.map((p) => ({
    id: p.id, title: p.title, image: p.featuredMedia?.preview?.image?.url ?? '',
    variants: p.variants.nodes.map((v) => ({ id: v.id, title: v.title, price: v.price })),
  }));
}

/**
 * Figui va a desconectar Shopify (o borrar la cuenta): se quita el formulario
 * del tema mientras el acceso aún vale y la tienda deja de recibir pedidos por
 * aquí (si no, el formulario seguiría visible y los pedidos no llegarían).
 */
export async function disconnectFromFigui(domain: string): Promise<{ removed: boolean }> {
  const shop = await db.shop.findUnique({ where: { domain }, include: { shopifyApp: true } });
  if (!shop || shop.uninstalledAt || shop.shopifyApp.handle !== 'figui') return { removed: false };
  let removed = false;
  if (hasThemeScopes(shop.scopes) && shop.accessTokenEnc.length) {
    try {
      await removeFromTheme(domain, await shopToken(shop.id, shop.accessTokenEnc));
      removed = true;
    } catch (e) {
      console.warn('[figui] no se pudo quitar el formulario del tema al desconectar', domain, (e as Error).message);
    }
  }
  await db.shop.update({ where: { id: shop.id }, data: { uninstalledAt: new Date(), accessTokenEnc: Buffer.alloc(0) } });
  return { removed };
}

/** Figui se reconectó a Shopify: si la tienda ya usa el formulario, se actualiza su acceso. */
export async function refreshTokenFromFigui(domain: string, accessToken: string, scopes: string): Promise<{ updated: boolean }> {
  const shop = await db.shop.findUnique({ where: { domain }, include: { shopifyApp: true } });
  if (!shop || shop.uninstalledAt || shop.shopifyApp.handle !== 'figui') return { updated: false };
  const { encryptForShop } = await import('./crypto.server');
  await db.shop.update({ where: { id: shop.id }, data: { accessTokenEnc: encryptForShop(shop.id, accessToken), scopes } });
  return { updated: true };
}
