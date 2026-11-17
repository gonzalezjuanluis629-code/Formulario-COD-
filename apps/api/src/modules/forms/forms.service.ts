import { Injectable, NotFoundException } from '@nestjs/common';
import { ThemeTokensSchema, LocationConfigSchema, ShopSettingsSchema, OfferSchema, AddonSchema } from '@cod/contracts';
import type { WidgetConfig } from '@cod/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminClientService } from '../../infra/shopify/admin-client.service';
import { PageOffersService } from '../page-offers/page-offers.service';
import type { ShopContext } from '../../infra/shopify/shop-context.service';

/**
 * Devuelve TODO lo que el widget necesita en UNA sola llamada:
 * campos, tokens de diseño, config de ubicación, ofertas y producto.
 * Cacheable en edge 60 s → el storefront no golpea la BD en cada visita.
 */
@Injectable()
export class FormsService {
  constructor(private prisma: PrismaService, private admin: AdminClientService, private pageOffers: PageOffersService) {}

  async resolve(ctx: ShopContext, productGid: string, variantGid: string): Promise<WidgetConfig> {
    // Páginas sin producto (portada, colecciones…): no hay formulario que mostrar.
    if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantGid ?? '') || !/^gid:\/\/shopify\/Product\/\d+$/.test(productGid ?? '')) {
      throw new NotFoundException('Esta página no tiene producto');
    }
    // Primero traemos el producto con sus colecciones y tags, para poder
    // resolver asignaciones por colección/etiqueta/proveedor, no solo por producto.
    const variant = await this.admin.graphql<{
      productVariant: {
        price: string; title: string; image: { url: string } | null;
        product: {
          title: string; vendor: string; tags: string[];
          featuredImage: { url: string } | null;
          collections: { nodes: { id: string }[] };
        };
      } | null;
    }>(ctx, VARIANT_QUERY, { id: variantGid });

    if (!variant.productVariant) throw new NotFoundException('Variante no encontrada');
    const v = variant.productVariant;
    const collectionIds = v.product.collections.nodes.map((c) => c.id);

    // Todas las asignaciones activas que PODRÍAN aplicar a este producto.
    const candidates = await this.prisma.formAssignment.findMany({
      where: {
        form: { shopId: ctx.shopId, status: 'ACTIVE' },
        OR: [
          { type: 'ALL' },
          { type: 'PRODUCT', value: productGid },
          { type: 'COLLECTION', value: { in: collectionIds } },
          { type: 'TAG', value: { in: v.product.tags } },
          { type: 'VENDOR', value: v.product.vendor },
        ],
      },
      include: { form: { include: { theme: true, versions: true } } },
    });
    if (!candidates.length) throw new NotFoundException('No hay formulario activo para este producto');

    // Prioridad por especificidad: producto > colección > tag > vendor > todos.
    // A igualdad, gana el de mayor `priority` configurado por el merchant.
    const rank: Record<string, number> = { PRODUCT: 5, COLLECTION: 4, TAG: 3, VENDOR: 2, ALL: 1 };
    const assignment = candidates.sort(
      (a, b) => ((rank[b.type] ?? 0) - (rank[a.type] ?? 0)) || (b.priority - a.priority),
    )[0]!;

    const form = assignment.form;
    const version = form.versions.find((ver) => ver.id === form.currentVersionId) ?? form.versions.at(-1);
    if (!version) throw new NotFoundException('El formulario no tiene versión publicada');

    // Si el formulario no tiene diseño propio, usa el de la tienda (página «Diseño»).
    const themeTokens = form.theme?.tokens ?? (await this.prisma.theme.findFirst({
      where: { shopId: ctx.shopId, isDefault: true },
    }))?.tokens;

    const offers = await this.prisma.offer.findMany({
      where: { shopId: ctx.shopId, active: true, type: 'QUANTITY' },
    });

    const addonRows = await this.prisma.offer.findMany({
      where: { shopId: ctx.shopId, active: true, type: { in: ['UPSELL', 'ORDER_BUMP', 'DOWNSELL'] } },
      orderBy: { priority: 'desc' },
    });

    if (!variant.productVariant) throw new NotFoundException('Variante no encontrada');

    // Si la página del producto tiene su propia caja de ofertas, esas mandan.
    const unitPriceCents = Math.round(parseFloat(v.price) * 100);
    const fromPage = await this.pageOffers.forProduct(ctx, productGid, unitPriceCents);

    return {
      formId: form.id,
      formVersionId: version.id,
      displayMode: form.displayMode === 'POPUP' ? 'POPUP' : 'EMBEDDED',
      fields: version.schema as WidgetConfig['fields'],
      tokens: ThemeTokensSchema.parse(themeTokens ?? {}),
      location: LocationConfigSchema.parse(
        (ctx.settings as Record<string, unknown>).location ?? {},
      ),
      settings: this.publicSettings({ ...ShopSettingsSchema.parse(ctx.settings ?? {}), ...(ctx.currency ? { currency: ctx.currency } : {}) }),
      offers: fromPage.length ? fromPage : offers
        .map((o) => OfferSchema.parse({ id: o.id, label: o.name, type: 'QUANTITY', ...(o.payload as object) }))
        // Solo las ofertas de este producto (o de todos).
        .filter((o) => !o.productIds.length || o.productIds.includes(productGid)),
      addons: addonRows.map((o) => AddonSchema.parse({ id: o.id, ...(o.payload as object) })),
      product: {
        variantId: variantGid,
        title: v.product.title,
        unitPriceCents: Math.round(parseFloat(v.price) * 100),
        image: v.image?.url ?? v.product.featuredImage?.url ?? null,
      },
    };
  }

  /**
   * SEGURIDAD: el widget recibe settings, pero JAMÁS los secretos.
   * El token del CAPI, el secret de Turnstile y los tokens de TikTok/GA4 viven
   * solo en el servidor. Al navegador solo van los IDs de píxel (que de todos
   * modos son públicos y aparecen en el código de cualquier tienda).
   */
  private publicSettings(s: ReturnType<typeof ShopSettingsSchema.parse>) {
    return {
      ...s,
      tracking: {
        ...s.tracking,
        metaCapiToken: '',
        metaTestCode: '',
        tiktokToken: '',
        ga4ApiSecret: '',
      },
      antifraud: { ...s.antifraud, turnstileSecret: '' },
    };
  }
}

const VARIANT_QUERY = /* GraphQL */ `
  query CodVariant($id: ID!) {
    productVariant(id: $id) {
      price
      title
      image { url }
      product {
        title
        vendor
        tags
        featuredImage { url }
        collections(first: 25) { nodes { id } }
      }
    }
  }
`;
