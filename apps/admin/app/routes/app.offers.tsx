import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Banner, BlockStack, Box, Button, ButtonGroup, Checkbox, Collapsible, Divider, Frame, Icon, IndexTable,
  InlineStack, Modal, Page, Select, Tabs, Text, TextField, 
} from '@shopify/polaris';
import { SavedToast } from '../components/SavedToast';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronRightIcon, DeleteIcon, PlusIcon } from '@shopify/polaris-icons';
import { Form, useFetcher, useLoaderData, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { AddonSchema, OfferSchema, ShopSettingsSchema, ThemeTokensSchema, type Addon, type Field, type Offer, type ThemeTokens } from '@cod/contracts';
import { DO_PROVINCES } from '@cod/geo';
import { requireShop } from '../lib/shop.server';
import { pickResources } from '../lib/base';
import { db } from '../db.server';
import { productInfo } from '../lib/products.server';
import { IntentButton } from '../components/IntentButton';
import { Preview } from '../features/builder/Preview';
import { DEFAULT_FIELDS } from '../lib/defaults';
import { CardAnimationPicker } from '../features/builder/CardAnimationPicker';
import type { CardAnimation } from '../../../widget/src/ui/cardAnimations';

/* ─────────────── Borradores (lo que se edita en pantalla) ─────────────── */

type OfferDraft = {
  id: string; active: boolean; minQty: string; title: string; subtitle: string; badge: string;
  priceMode: 'bundle' | 'percent' | 'amount' | 'none'; bundlePrice: string; percent: string; amount: string;
  freeShipping: boolean; preselected: boolean;
  /** Aspecto de la tarjeta (como los extras). Sin colores propios = los del diseño. */
  customColors: boolean; border: 'solid' | 'dashed' | 'none'; borderColor: string; bg: string;
  animation: CardAnimation; animationSpeed: 'slow' | 'normal' | 'fast';
  badgeColor: string; badgeSide: 'left' | 'right'; badgeTimer: string;
} & ProductScopeDraft & ProvinceDraft;

/** En qué provincias sale una oferta o un extra. */
type ProvinceDraft = { provMode: 'all' | 'only' | 'except'; provCodes: string[] };

/** En qué productos vale una oferta o un cupón. */
type ProductScopeDraft = { scope: 'all' | 'some'; products: ScopeProduct[] };
/** priceCents: precio real en Shopify (para la vista previa y los ejemplos). */
type ScopeProduct = { id: string; title: string; priceCents?: number | null };

type AddonDraft = {
  id: string; active: boolean; kind: 'ORDER_BUMP' | 'UPSELL' | 'DOWNSELL';
  chargeType: 'product' | 'charge'; variantId: string; productTitle: string;
  title: string; description: string; image: string; price: string; compareAt: string; replacesId: string;
  border: 'dashed' | 'solid' | 'none'; borderColor: string; bg: string;
  animation: CardAnimation; animationSpeed: 'slow' | 'normal' | 'fast';
  badgeText: string; badgeColor: string; badgeSide: 'left' | 'right'; badgeTimer: string;
} & ProvinceDraft;

const provincesOf = (d: ProvinceDraft) => ({ mode: d.provCodes.length ? d.provMode : 'all' as const, codes: d.provMode === 'all' ? [] : d.provCodes });
const provinceDraft = (r: { mode: 'all' | 'only' | 'except'; codes: string[] }): ProvinceDraft => ({ provMode: r.mode, provCodes: r.codes });

const cents = (v: string) => Math.round((Number(String(v).replace(/[^0-9.]/g, '')) || 0) * 100);
const fromCents = (c: number | null | undefined) => (c != null && c > 0 ? String(c / 100) : '');
const newId = () => `new-${Math.random().toString(36).slice(2, 9)}`;

function toOffer(d: OfferDraft): Offer {
  const qty = Math.max(1, parseInt(d.minQty, 10) || 1);
  return {
    id: d.id, type: 'QUANTITY', minQty: qty,
    discountBps: d.priceMode === 'percent' ? Math.round((Number(d.percent) || 0) * 100) : 0,
    bundlePriceCents: d.priceMode === 'bundle' && d.bundlePrice ? cents(d.bundlePrice) : null,
    discountCents: d.priceMode === 'amount' ? cents(d.amount) : 0,
    productIds: d.products.map((p) => p.id),
    freeShipping: d.freeShipping, label: d.title || `${qty} unidades`,
    title: d.title, subtitle: d.subtitle, badge: d.badge, preselected: d.preselected,
    provinces: provincesOf(d),
    style: {
      border: d.customColors ? d.border : 'solid',
      borderColor: d.customColors && d.border !== 'none' ? d.borderColor : '',
      bg: d.customColors ? d.bg : '',
      animation: d.animation, animationSpeed: d.animationSpeed,
      badgeColor: d.badgeColor.trim(), badgeSide: d.badgeSide,
      badgeTimer: Math.min(1440, Math.max(0, parseInt(d.badgeTimer, 10) || 0)),
    },
  };
}

function toAddon(d: AddonDraft): Addon {
  return {
    id: d.id, kind: d.kind,
    variantId: d.chargeType === 'product' ? (d.variantId || null) : null,
    title: d.title || 'Extra', description: d.description, image: d.image || null,
    priceCents: cents(d.price), compareAtCents: d.compareAt ? cents(d.compareAt) : null,
    qty: 1, replacesId: d.kind === 'DOWNSELL' ? (d.replacesId || null) : null, minCartCents: 0,
    style: { border: d.border, borderColor: d.borderColor, bg: d.bg, animation: d.animation, animationSpeed: d.animationSpeed,
      badgeText: d.badgeText.trim(), badgeColor: d.badgeColor, badgeSide: d.badgeSide,
      badgeTimer: Math.min(1440, Math.max(0, parseInt(d.badgeTimer, 10) || 0)) },
    provinces: provincesOf(d),
  };
}

/* ─────────────── Servidor ─────────────── */

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop, admin } = await requireShop(request);
  const [offerRows, addonRows, discounts, form, theme] = await Promise.all([
    db.offer.findMany({ where: { shopId: shop.id, type: 'QUANTITY' }, orderBy: { priority: 'asc' } }),
    db.offer.findMany({ where: { shopId: shop.id, type: { in: ['UPSELL', 'ORDER_BUMP', 'DOWNSELL'] } }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
    db.discount.findMany({ where: { shopId: shop.id }, orderBy: { name: 'asc' } }),
    db.form.findFirst({ where: { shopId: shop.id, status: { not: 'ARCHIVED' } }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] }),
    db.theme.findFirst({ where: { shopId: shop.id, isDefault: true } }),
  ]);
  const version = form?.currentVersionId ? await db.formVersion.findUnique({ where: { id: form.currentVersionId } }) : null;

  // Precio REAL (y nombre actual) de los productos de las ofertas, leído de Shopify.
  const ids = [...new Set(offerRows.flatMap((r) => {
    const p = (r.payload as { productIds?: unknown }).productIds;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  }))];
  const live = await productInfo(shop, admin, ids);

  const offers: OfferDraft[] = offerRows.map((r) => {
    const o = OfferSchema.parse({ id: r.id, label: r.name, type: 'QUANTITY', ...(r.payload as object) });
    return {
      id: r.id, active: r.active, minQty: String(o.minQty), title: o.title, subtitle: o.subtitle, badge: o.badge,
      priceMode: o.bundlePriceCents != null ? 'bundle' : o.discountCents > 0 ? 'amount' : o.discountBps > 0 ? 'percent' : 'none',
      bundlePrice: fromCents(o.bundlePriceCents), percent: o.discountBps ? String(o.discountBps / 100) : '',
      amount: fromCents(o.discountCents),
      freeShipping: o.freeShipping, preselected: o.preselected, ...provinceDraft(o.provinces),
      customColors: !!(o.style.bg || o.style.borderColor || o.style.border !== 'solid'),
      border: o.style.border, borderColor: o.style.borderColor || '#4f6b94', bg: o.style.bg || '#ffffff',
      animation: o.style.animation, animationSpeed: o.style.animationSpeed,
      badgeColor: o.style.badgeColor, badgeSide: o.style.badgeSide, badgeTimer: o.style.badgeTimer ? String(o.style.badgeTimer) : '',
      ...scopeFrom(o.productIds, (r.payload as { productTitles?: unknown }).productTitles, live),
    };
  });
  const addons: AddonDraft[] = addonRows.map((r) => {
    const p = r.payload as Record<string, unknown>;
    const a = AddonSchema.parse({ id: r.id, ...p });
    return {
      id: r.id, active: r.active, kind: a.kind, chargeType: a.variantId ? 'product' : 'charge',
      variantId: a.variantId ?? '', productTitle: String(p.productTitle ?? ''),
      title: a.title, description: a.description, image: a.image ?? '',
      price: fromCents(a.priceCents), compareAt: fromCents(a.compareAtCents), replacesId: a.replacesId ?? '',
      border: a.style.border, borderColor: a.style.borderColor, bg: a.style.bg,
      animation: a.style.animation, animationSpeed: a.style.animationSpeed,
      badgeText: a.style.badgeText, badgeColor: a.style.badgeColor, badgeSide: a.style.badgeSide, badgeTimer: a.style.badgeTimer ? String(a.style.badgeTimer) : '',
      ...provinceDraft(a.provinces),
    };
  });

  return {
    offers, addons,
    discounts: discounts.map((d) => {
      const c = (d.conditions ?? {}) as { productIds?: unknown; productTitles?: unknown };
      const sc = scopeFrom(Array.isArray(c.productIds) ? c.productIds as string[] : [], c.productTitles);
      return { id: d.id, code: d.code ?? '', name: d.name, type: d.type, payload: d.payload, usageCount: d.usageCount, usageLimit: d.usageLimit, products: sc.products };
    }),
    fields: ((version?.schema as Field[] | undefined) ?? DEFAULT_FIELDS),
    tokens: ThemeTokensSchema.parse(theme?.tokens ?? {}),
    currency: shop.currency,
    shipping: (() => {
      const st = ShopSettingsSchema.parse(shop.settings ?? {});
      return { defaultShippingCents: st.defaultShippingCents, freeShippingOverCents: st.freeShippingOverCents, codFeeCents: st.codFeeCents };
    })(),
  };
}

type Result = { ok: boolean; message: string };

export async function action({ request }: ActionFunctionArgs): Promise<Result | null> {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const intent = String(fd.get('intent'));

  if (intent === 'offers:save') {
    const body = JSON.parse(String(fd.get('data'))) as { offers: OfferDraft[]; addons: AddonDraft[]; offerCard: ThemeTokens['offerCard'] };

    // Ofertas por cantidad: crear, actualizar y borrar las quitadas.
    const keepOffers: string[] = [];
    for (const d of body.offers) {
      if (!d.products.length) {
        return { ok: false, message: `Elige el producto de la oferta «${d.title || `${d.minQty} unidades`}».` };
      }
      if (d.provMode !== 'all' && !d.provCodes.length) {
        return { ok: false, message: `Elige al menos una provincia en la oferta «${d.title || `${d.minQty} unidades`}» (o déjala en «Todas»).` };
      }
      if (d.priceMode === 'amount' && !(cents(d.amount) > 0)) {
        return { ok: false, message: `Pon el monto de descuento de la oferta «${d.title || `${d.minQty} unidades`}».` };
      }
      const o = toOffer(d);
      const data = {
        name: o.label, type: 'QUANTITY' as const, priority: o.minQty, active: d.active,
        payload: {
          minQty: o.minQty, discountBps: o.discountBps, freeShipping: o.freeShipping, title: o.title,
          subtitle: o.subtitle, badge: o.badge, bundlePriceCents: o.bundlePriceCents, preselected: o.preselected,
          discountCents: o.discountCents, productIds: o.productIds,
          productTitles: d.products.map((p) => p.title), provinces: o.provinces,
        },
      };
      if (d.id.startsWith('new-')) keepOffers.push((await db.offer.create({ data: { shopId: shop.id, ...data } })).id);
      else { await db.offer.updateMany({ where: { id: d.id, shopId: shop.id }, data }); keepOffers.push(d.id); }
    }
    await db.offer.deleteMany({ where: { shopId: shop.id, type: 'QUANTITY', id: { notIn: keepOffers } } });

    // Extras. Los downsell se guardan al final para poder apuntar al upsell recién creado.
    const keepAddons: string[] = [];
    const idMap = new Map<string, string>();
    // El orden de la lista es el orden en la tienda: el primero lleva la prioridad más alta.
    const rankOf = new Map(body.addons.map((d, i) => [d.id, body.addons.length - i]));
    const ordered = [...body.addons].sort((a, b) => (a.kind === 'DOWNSELL' ? 1 : 0) - (b.kind === 'DOWNSELL' ? 1 : 0));
    for (const d of ordered) {
      if (d.chargeType === 'product' && !d.variantId) return { ok: false, message: `Elige el producto del extra «${d.title || 'sin título'}».` };
      if (d.chargeType === 'charge' && !(cents(d.price) > 0)) return { ok: false, message: `Pon el precio del cargo «${d.title || 'sin título'}».` };
      if (d.provMode !== 'all' && !d.provCodes.length) return { ok: false, message: `Elige al menos una provincia en el extra «${d.title.replace(/\*\*/g, '') || 'sin título'}» (o déjalo en «Todas»).` };
      const a = toAddon({ ...d, replacesId: idMap.get(d.replacesId) ?? d.replacesId });
      const data = {
        name: a.title.replace(/\*\*/g, '').slice(0, 120), type: a.kind, active: d.active,
        priority: rankOf.get(d.id) ?? 0,
        payload: { ...a, id: undefined, productTitle: d.productTitle } as object,
      };
      if (d.id.startsWith('new-')) {
        const row = await db.offer.create({ data: { shopId: shop.id, ...data } });
        idMap.set(d.id, row.id); keepAddons.push(row.id);
      } else { await db.offer.updateMany({ where: { id: d.id, shopId: shop.id }, data }); keepAddons.push(d.id); }
    }
    await db.offer.deleteMany({
      where: { shopId: shop.id, type: { in: ['UPSELL', 'ORDER_BUMP', 'DOWNSELL'] }, id: { notIn: keepAddons } },
    });

    // Estilo de las tarjetas: va en el diseño de la tienda.
    const theme = (await db.theme.findFirst({ where: { shopId: shop.id, isDefault: true } }))
      ?? await db.theme.create({ data: { shopId: shop.id, name: 'Tema por defecto', isDefault: true, tokens: {} } });
    const tokens = ThemeTokensSchema.parse({ ...(theme.tokens as object), offerCard: body.offerCard });
    await db.theme.update({ where: { id: theme.id }, data: { tokens: tokens as object } });

    return { ok: true, message: 'Ofertas guardadas. Ya están en tu tienda (puede tardar 1 minuto).' };
  }

  if (intent === 'discount:create') {
    const type = String(fd.get('type')) as 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING';
    const value = Number(fd.get('value') || 0);
    const code = String(fd.get('code') || '').trim().toUpperCase();
    if (!code) return { ok: false, message: 'Escribe el código del cupón.' };
    if (type !== 'FREE_SHIPPING' && !(value > 0)) return { ok: false, message: 'Pon cuánto descuenta el cupón.' };
    if (type === 'PERCENTAGE' && value > 100) return { ok: false, message: 'El porcentaje no puede pasar de 100.' };
    const products = JSON.parse(String(fd.get('products') || '[]')) as { id: string; title: string }[];
    const fields = {
      name: String(fd.get('name') || code), type,
      usageLimit: fd.get('usageLimit') ? Number(fd.get('usageLimit')) : null,
      payload: type === 'PERCENTAGE' ? { valueBps: Math.round(value * 100) }
        : type === 'FIXED' ? { valueCents: Math.round(value * 100) } : {},
      // Vacío = vale en todos los productos.
      conditions: { productIds: products.map((p) => p.id), productTitles: products.map((p) => p.title) },
    };
    const existed = await db.discount.findUnique({ where: { shopId_code: { shopId: shop.id, code } } });
    await db.discount.upsert({
      where: { shopId_code: { shopId: shop.id, code } },
      update: fields,
      create: { shopId: shop.id, code, ...fields },
    });
    return { ok: true, message: existed ? `Cupón ${code} actualizado.` : `Cupón ${code} creado.` };
  }

  if (intent === 'discount:delete') {
    await db.discount.deleteMany({ where: { id: String(fd.get('id')), shopId: shop.id } });
    return { ok: true, message: 'Cupón eliminado.' };
  }
  return null;
}

/* ─────────────── Pantalla ─────────────── */

type Tab = 'qty' | 'extras' | 'coupons' | 'style';
const TABS: { id: Tab; content: string }[] = [
  { id: 'qty', content: 'Por cantidad' },
  { id: 'extras', content: 'Extras' },
  { id: 'coupons', content: 'Cupones' },
  { id: 'style', content: 'Estilo' },
];

export default function Offers() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<Result>();
  const [tab, setTab] = useState<Tab>('qty');
  const [offers, setOffers] = useState<OfferDraft[]>(data.offers);
  const [addons, setAddons] = useState<AddonDraft[]>(data.addons);
  const [card, setCard] = useState<ThemeTokens['offerCard']>(data.tokens.offerCard);
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [couponModal, setCouponModal] = useState(false);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) { setToast(fetcher.data.message); setDirty(false); }
  }, [fetcher.state, fetcher.data]);

  const updOffer = (id: string, p: Partial<OfferDraft>) => {
    setOffers((l) => l.map((o) => {
      if (o.id === id) return { ...o, ...p };
      // Solo una tarjeta puede venir marcada por defecto.
      return p.preselected ? { ...o, preselected: false } : o;
    }));
    setDirty(true);
  };
  const moveAddon = (i: number, dir: -1 | 1) => {
    setAddons((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
    setDirty(true);
  };
  const updAddon = (id: string, p: Partial<AddonDraft>) => { setAddons((l) => l.map((a) => (a.id === id ? { ...a, ...p } : a))); setDirty(true); };

  const addOffer = () => {
    const used = offers.map((o) => parseInt(o.minQty, 10) || 1);
    const qty = Math.max(1, ...used) + (offers.length ? 1 : 1);
    const d: OfferDraft = {
      id: newId(), active: true, minQty: String(offers.length ? qty : 2), title: '', subtitle: '', badge: '',
      priceMode: 'bundle', bundlePrice: '', percent: '10', amount: '', freeShipping: false, preselected: false,
      scope: 'some', products: [], provMode: 'all', provCodes: [],
      customColors: false, border: 'solid', borderColor: '#4f6b94', bg: '#ffffff', animation: 'none', animationSpeed: 'normal',
      badgeColor: '', badgeSide: 'right', badgeTimer: '',
    };
    setOffers((l) => [...l, d]); setOpen(d.id); setDirty(true);
  };
  const addAddon = (chargeType: AddonDraft['chargeType']) => {
    const d: AddonDraft = {
      id: newId(), active: true, kind: 'ORDER_BUMP', chargeType, variantId: '', productTitle: '',
      title: chargeType === 'charge' ? 'Envío Plus Express {precio}' : 'Agrega **un producto extra** por solo {precio}',
      description: chargeType === 'charge' ? 'Recíbelo en menos de 24 horas' : '', image: '',
      price: chargeType === 'charge' ? '350' : '', compareAt: '', replacesId: '',
      border: 'dashed', borderColor: chargeType === 'charge' ? '#94b07f' : '#1f2a44', bg: chargeType === 'charge' ? '#f7faf3' : '#eef0fa',
      animation: 'none', animationSpeed: 'normal',
      badgeText: '', badgeColor: '#e11d48', badgeSide: 'right', badgeTimer: '',
      provMode: 'all', provCodes: [],
    };
    setAddons((l) => [...l, d]); setOpen(d.id); setDirty(true);
  };

  const pickProduct = useCallback(async (id: string) => {
    const picked = await pickResources({ type: 'product' });
    const p = picked?.[0];
    const v = p?.variants?.[0];
    if (!p || !v) return;
    const img = p.images?.[0]?.originalSrc || p.images?.[0]?.url || '';
    updAddon(id, { variantId: v.id, productTitle: p.title, image: img, price: v.price ? String(Number(v.price)) : '' });
  }, []);

  const save = async () => {
    const url = new URL(window.location.href);
    const shopify = (window as unknown as { shopify?: { idToken?: () => Promise<string> } }).shopify;
    if (shopify?.idToken) url.searchParams.set('id_token', await shopify.idToken());
    fetcher.submit(
      { intent: 'offers:save', data: JSON.stringify({ offers, addons, offerCard: card }) },
      { method: 'post', action: `${url.pathname}${url.search}` },
    );
  };

  // Vista previa: solo lo activo, ordenado como en la tienda.
  // La vista previa usa el producto (y su precio real) de la oferta abierta,
  // o el de la primera oferta con producto. Solo muestra las ofertas de ese producto.
  const pvProduct = useMemo(() => {
    const opened = offers.find((o) => o.id === open && o.products.length);
    return (opened ?? offers.find((o) => o.products.length))?.products[0] ?? null;
  }, [offers, open]);
  const pvOffers = useMemo(() => offers
    .filter((o) => o.active && pvProduct && o.products.some((p) => p.id === pvProduct.id))
    // La vista previa enseña todo; las provincias se aplican en la tienda.
    .map((o) => ({ ...toOffer(o), provinces: ALL_PROVINCES })), [offers, pvProduct]);
  const pvAddons = useMemo(() => addons.filter((a) => a.active).map((a) => ({ ...toAddon(a), provinces: ALL_PROVINCES })), [addons]);
  const pvTokens = useMemo(() => ({ ...data.tokens, offerCard: card }), [data.tokens, card]);

  const busy = fetcher.state !== 'idle';

  return (
    <Frame>
      <style>{CSS}</style>
      <Page
        fullWidth
        title="Ofertas y descuentos"
        titleMetadata={dirty ? <Badge tone="attention">Cambios sin guardar</Badge> : undefined}
        primaryAction={{ content: 'Guardar', loading: busy, disabled: !dirty, onAction: save }}
      >
        {fetcher.data && !fetcher.data.ok && fetcher.state === 'idle' && (
          <div style={{ marginBottom: 12 }}><Banner tone="critical" title="No se pudo guardar">{fetcher.data.message}</Banner></div>
        )}

        <div className="cod-editor">
          <div className="cod-editor-side">
            <div className="cod-editor-tabs">
              <Tabs tabs={TABS} selected={TABS.findIndex((t) => t.id === tab)} onSelect={(i) => setTab(TABS[i]!.id)} fitted />
            </div>
            <div className="cod-editor-body">
              {/* ── Por cantidad ── */}
              {tab === 'qty' && (
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Tarjetas para elegir cuántas unidades lleva el cliente. Se aplica la de la cantidad elegida.
                  </Text>
                  <Banner tone="info">
                    ¿Tu página de producto ya tiene su propia caja de ofertas con precios («2 unidades · RD$ 2,950»)?
                    Entonces no tienes que crear nada aquí: el formulario cobra los precios de tu página
                    (también desde el carrito). Estas ofertas se usan en los productos que no tienen esa caja.
                  </Banner>
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <Checkbox label="Mostrar las tarjetas en el formulario" checked={card.showInForm}
                      onChange={(v) => { setCard({ ...card, showInForm: v }); setDirty(true); }}
                      helpText={card.showInForm
                        ? 'Desmárcalo si las ofertas ya están en tu página de producto: el cliente elige ahí y el formulario cobra con el precio de la oferta.'
                        : 'Las tarjetas no salen en el formulario. El cliente elige la cantidad en tu página y se cobra con el precio de la oferta de esa cantidad.'} />
                  </Box>
                  {[...offers].sort((a, b) => (parseInt(a.minQty, 10) || 0) - (parseInt(b.minQty, 10) || 0)).map((o) => (
                    <Item key={o.id} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)}
                      title={o.title || `${o.minQty || '?'} unidades`}
                      subtitle={`${o.priceMode === 'bundle' && o.bundlePrice ? `Paquete por RD$ ${o.bundlePrice}`
                        : o.priceMode === 'percent' && o.percent ? `${o.percent} % de descuento`
                        : o.priceMode === 'amount' && o.amount ? `RD$ ${o.amount} de descuento` : 'Sin descuento'}${scopeLabel(o)}`}
                      badges={[!o.active && 'Pausada', o.badge, o.preselected && 'Marcada', provinceBadge(o)].filter(Boolean) as string[]}>
                      <InlineStack gap="200" wrap={false}>
                        <div style={{ width: 110 }}>
                          <TextField label="Unidades" type="number" min={1} value={o.minQty} autoComplete="off"
                            onChange={(v) => updOffer(o.id, { minQty: v })} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <TextField label="Título" value={o.title} autoComplete="off" placeholder={`${o.minQty || 2} unidades`}
                            onChange={(v) => updOffer(o.id, { title: v })} />
                        </div>
                      </InlineStack>
                      <TextField label="Descripción" value={o.subtitle} autoComplete="off" placeholder="Ej. Ideal para regalar"
                        onChange={(v) => updOffer(o.id, { subtitle: v })} />
                      <Choice label="Precio" value={o.priceMode} onChange={(v) => updOffer(o.id, { priceMode: v as OfferDraft['priceMode'] })}
                        options={[['bundle', 'Paquete'], ['percent', '% menos'], ['amount', 'Monto fijo'], ['none', 'Normal']]} />
                      {o.priceMode === 'percent' && <Text as="p" variant="bodySm" tone="subdued">{priceHint(o, 'percent')}</Text>}
                      {o.priceMode === 'bundle' && (
                        <TextField label={`Precio total por ${o.minQty || 'X'} unidades`} prefix="RD$" type="number" value={o.bundlePrice}
                          autoComplete="off" onChange={(v) => updOffer(o.id, { bundlePrice: v })}
                          helpText={priceHint(o, 'bundle')} />
                      )}
                      {o.priceMode === 'percent' && (
                        <TextField label="Descuento" suffix="%" type="number" value={o.percent} autoComplete="off"
                          onChange={(v) => updOffer(o.id, { percent: v })} />
                      )}
                      {o.priceMode === 'amount' && (
                        <TextField label={`Cuánto se descuenta al llevar ${o.minQty || 'X'} unidades`} prefix="RD$" type="number" value={o.amount}
                          autoComplete="off" onChange={(v) => updOffer(o.id, { amount: v })}
                          helpText={priceHint(o, 'amount')} />
                      )}
                      <ProductScope required value={o} onChange={(p) => updOffer(o.id, p)} />
                      <TextField label="Cinta destacada" value={o.badge} autoComplete="off" placeholder="Ej. MÁS VENDIDO (vacío = sin cinta)"
                        onChange={(v) => updOffer(o.id, { badge: v })} />
                      <Checkbox label="Envío gratis con esta oferta" checked={o.freeShipping} onChange={(v) => updOffer(o.id, { freeShipping: v })} />
                      <Checkbox label="Que venga marcada al abrir el formulario" checked={o.preselected} onChange={(v) => updOffer(o.id, { preselected: v })} />
                      <ProvincePicker value={o} what="esta oferta" onChange={(p) => updOffer(o.id, p)} />
                      <Divider />
                      <Text as="h3" variant="headingSm">Aspecto de la tarjeta</Text>
                      <Checkbox label="Colores propios para esta tarjeta" checked={o.customColors}
                        helpText="Sin marcar, usa los colores de «Diseño» como las demás."
                        onChange={(v) => updOffer(o.id, { customColors: v })} />
                      {o.customColors && (<>
                        <Choice label="Borde" value={o.border} onChange={(v) => updOffer(o.id, { border: v as OfferDraft['border'] })}
                          options={[['solid', 'Línea'], ['dashed', 'Rayas'], ['none', 'Sin borde']]} />
                        {o.border !== 'none' && <Color label="Color del borde" value={o.borderColor} onChange={(v) => updOffer(o.id, { borderColor: v })} />}
                        <Color label="Color de fondo" value={o.bg} onChange={(v) => updOffer(o.id, { bg: v })} />
                      </>)}
                      <CardAnimationPicker value={o.animation} speed={o.animationSpeed}
                        border={o.customColors ? (o.border === 'none' ? 'none' : o.border) : 'solid'}
                        borderColor={o.customColors ? o.borderColor : '#4f6b94'} background={o.customColors ? o.bg : '#ffffff'}
                        sample={o.title.trim().slice(0, 22) || `${o.minQty || 2} unidades`} stopHint="Se detiene cuando el cliente elige esta oferta."
                        onChange={(v) => updOffer(o.id, { animation: v })} onSpeed={(v) => updOffer(o.id, { animationSpeed: v })} />
                      {(o.badge.trim() || o.badgeTimer) && (<>
                        <Choice label="Lado de la cinta" value={o.badgeSide} onChange={(v) => updOffer(o.id, { badgeSide: v as OfferDraft['badgeSide'] })}
                          options={[['left', 'Izquierda'], ['right', 'Derecha']]} />
                        <Color label="Color de la cinta (vacío = el de «Diseño»)" value={o.badgeColor} onChange={(v) => updOffer(o.id, { badgeColor: v })} />
                      </>)}
                      <TextField label="Temporizador en la cinta (minutos)" type="number" min={0} max={1440} value={o.badgeTimer} autoComplete="off" placeholder="Sin temporizador"
                        helpText="Cuenta regresiva, por ejemplo 15. Cada cliente ve su propio reloj; al llegar a cero vuelve a empezar."
                        onChange={(v) => updOffer(o.id, { badgeTimer: v.replace(/[^0-9]/g, '').slice(0, 4) })} />
                      <ItemFooter active={o.active} onActive={(v) => updOffer(o.id, { active: v })}
                        onDelete={() => { setOffers((l) => l.filter((x) => x.id !== o.id)); setDirty(true); }} />
                    </Item>
                  ))}
                  {offers.length > 0 && !offers.some((o) => o.minQty === '1') && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      La tarjeta «1 unidad» se añade sola. Crea una oferta de 1 unidad si quieres cambiar su texto.
                    </Text>
                  )}
                  <Button icon={PlusIcon} onClick={addOffer}>Añadir oferta por cantidad</Button>
                </BlockStack>
              )}

              {/* ── Extras ── */}
              {tab === 'extras' && (
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Casillas que suman algo al pedido: otro producto a precio especial o un cargo como el envío express.
                  </Text>
                  {addons.length > 1 && (
                    <Text as="p" variant="bodySm" tone="subdued">Usa las flechas para elegir cuál sale primero.</Text>
                  )}
                  {addons.map((a, i) => (
                    <Item key={a.id} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)}
                      onUp={i > 0 ? () => moveAddon(i, -1) : undefined}
                      onDown={i < addons.length - 1 ? () => moveAddon(i, 1) : undefined}
                      showMove={addons.length > 1}
                      title={a.title.replace(/\*\*/g, '').replace(/\{precio\}/gi, a.price ? `RD$ ${a.price}` : '') || 'Extra'}
                      subtitle={a.chargeType === 'charge' ? 'Cargo extra' : a.productTitle || 'Producto sin elegir'}
                      badges={[!a.active && 'Pausado', a.kind === 'UPSELL' ? 'Upsell' : a.kind === 'DOWNSELL' ? 'Downsell' : '', provinceBadge(a)].filter(Boolean) as string[]}>
                      <Choice label="¿Qué se suma al pedido?" value={a.chargeType}
                        onChange={(v) => updAddon(a.id, { chargeType: v as AddonDraft['chargeType'] })}
                        options={[['product', 'Un producto'], ['charge', 'Un cargo (sin producto)']]} />
                      {a.chargeType === 'product' && (
                        <Button onClick={() => pickProduct(a.id)}>{a.productTitle || 'Elegir producto…'}</Button>
                      )}
                      <TextField label="Texto" value={a.title} autoComplete="off" multiline={2}
                        onChange={(v) => updAddon(a.id, { title: v })}
                        helpText="Pon **así** para negrita y {precio} donde quieras el precio." />
                      <TextField label="Texto pequeño (opcional)" value={a.description} autoComplete="off"
                        onChange={(v) => updAddon(a.id, { description: v })} />
                      <InlineStack gap="200" wrap={false}>
                        <div style={{ flex: 1 }}>
                          <TextField label={a.chargeType === 'charge' ? 'Precio del cargo' : 'Precio especial'} prefix="RD$" type="number"
                            value={a.price} autoComplete="off" onChange={(v) => updAddon(a.id, { price: v })}
                            helpText={a.chargeType === 'product' ? 'Vacío = precio normal de la tienda.' : undefined} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <TextField label="Precio antes (tachado)" prefix="RD$" type="number" value={a.compareAt}
                            autoComplete="off" onChange={(v) => updAddon(a.id, { compareAt: v })} />
                        </div>
                      </InlineStack>
                      <TextField label="Imagen (enlace)" value={a.image} autoComplete="off" placeholder="https://…"
                        onChange={(v) => updAddon(a.id, { image: v })} />
                      <Choice label="Tipo" value={a.kind} onChange={(v) => updAddon(a.id, { kind: v as AddonDraft['kind'] })}
                        options={[['ORDER_BUMP', 'Casilla'], ['UPSELL', 'Botón «Añadir»'], ['DOWNSELL', 'Alternativa']]} />
                      {a.kind === 'DOWNSELL' && (
                        <Select label="Se ofrece si el cliente quita…" value={a.replacesId}
                          options={[{ label: 'Elige un extra con botón «Añadir»', value: '' },
                            ...addons.filter((x) => x.kind === 'UPSELL').map((x) => ({ label: x.title.replace(/\*\*/g, ''), value: x.id }))]}
                          onChange={(v) => updAddon(a.id, { replacesId: v })} />
                      )}
                      <ProvincePicker value={a} what="este extra" onChange={(p) => updAddon(a.id, p)} />
                      <Divider />
                      <Choice label="Borde" value={a.border} onChange={(v) => updAddon(a.id, { border: v as AddonDraft['border'] })}
                        options={[['dashed', 'Rayas'], ['solid', 'Línea'], ['none', 'Sin borde']]} />
                      {a.border !== 'none' && <Color label="Color del borde" value={a.borderColor} onChange={(v) => updAddon(a.id, { borderColor: v })} />}
                      <Color label="Color de fondo" value={a.bg} onChange={(v) => updAddon(a.id, { bg: v })} />
                      <CardAnimationPicker value={a.animation} speed={a.animationSpeed} border={a.border} borderColor={a.borderColor} background={a.bg}
                        onChange={(v) => updAddon(a.id, { animation: v })} onSpeed={(v) => updAddon(a.id, { animationSpeed: v })} />
                      <Divider />
                      <Text as="h3" variant="headingSm">Etiqueta</Text>
                      <TextField label="Texto de la etiqueta" value={a.badgeText} autoComplete="off" maxLength={40} placeholder="🔥 Oferta flash"
                        helpText="Sobresale arriba de la tarjeta. Déjalo vacío para no mostrar etiqueta." onChange={(v) => updAddon(a.id, { badgeText: v })} />
                      {(a.badgeText.trim() || a.badgeTimer) && (<>
                        <Choice label="Lado" value={a.badgeSide} onChange={(v) => updAddon(a.id, { badgeSide: v as AddonDraft['badgeSide'] })}
                          options={[['left', 'Izquierda'], ['right', 'Derecha']]} />
                        <Color label="Color de la etiqueta" value={a.badgeColor} onChange={(v) => updAddon(a.id, { badgeColor: v })} />
                      </>)}
                      <TextField label="Temporizador (minutos)" type="number" min={0} max={1440} value={a.badgeTimer} autoComplete="off" placeholder="Sin temporizador"
                        helpText="Cuenta regresiva en la etiqueta, por ejemplo 15. Cada cliente ve su propio reloj; al llegar a cero vuelve a empezar."
                        onChange={(v) => updAddon(a.id, { badgeTimer: v.replace(/[^0-9]/g, '').slice(0, 4) })} />
                      <ItemFooter active={a.active} onActive={(v) => updAddon(a.id, { active: v })}
                        onDelete={() => { setAddons((l) => l.filter((x) => x.id !== a.id)); setDirty(true); }} />
                    </Item>
                  ))}
                  <InlineStack gap="200">
                    <Button icon={PlusIcon} onClick={() => addAddon('product')}>Producto extra</Button>
                    <Button icon={PlusIcon} onClick={() => addAddon('charge')}>Cargo extra</Button>
                  </InlineStack>
                </BlockStack>
              )}

              {/* ── Cupones ── */}
              {tab === 'coupons' && (
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Códigos para el bloque «Código de descuento». También valen los códigos que ya tengas en Shopify.
                  </Text>
                  {data.discounts.length > 0 && (
                    <IndexTable itemCount={data.discounts.length} selectable={false}
                      headings={[{ title: 'Código' }, { title: 'Descuento' }, { title: 'Productos' }, { title: 'Usos' }, { title: '' }]}>
                      {data.discounts.map((d, i) => {
                        const p = d.payload as { valueBps?: number; valueCents?: number };
                        return (
                          <IndexTable.Row id={d.id} key={d.id} position={i}>
                            <IndexTable.Cell><Text as="span" fontWeight="semibold">{d.code}</Text></IndexTable.Cell>
                            <IndexTable.Cell>
                              {d.type === 'PERCENTAGE' ? `${(p.valueBps ?? 0) / 100} %` : d.type === 'FIXED' ? `RD$ ${(p.valueCents ?? 0) / 100}` : 'Envío gratis'}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text as="span" variant="bodySm" truncate>{d.products.length ? d.products.map((x) => x.title).join(', ') : 'Todos'}</Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>{d.usageCount}{d.usageLimit ? ` / ${d.usageLimit}` : ''}</IndexTable.Cell>
                            <IndexTable.Cell>
                              <Form method="post">
                                <input type="hidden" name="id" value={d.id} />
                                <IntentButton size="micro" tone="critical" variant="tertiary" intent="discount:delete">Eliminar</IntentButton>
                              </Form>
                            </IndexTable.Cell>
                          </IndexTable.Row>
                        );
                      })}
                    </IndexTable>
                  )}
                  <Button icon={PlusIcon} onClick={() => setCouponModal(true)}>Crear cupón</Button>
                </BlockStack>
              )}

              {/* ── Estilo ── */}
              {tab === 'style' && (
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Tarjetas por cantidad</Text>
                  <Color label="Contorno de la oferta elegida" value={card.accent} onChange={(v) => { setCard({ ...card, accent: v }); setDirty(true); }} />
                  <Checkbox label="Brillo suave alrededor de la oferta elegida" checked={card.glow !== false} onChange={(v) => { setCard({ ...card, glow: v }); setDirty(true); }} />
                  <Color label="Cinta: color inicial" value={card.badgeFrom} onChange={(v) => { setCard({ ...card, badgeFrom: v }); setDirty(true); }} />
                  <Color label="Cinta: color final" value={card.badgeTo} onChange={(v) => { setCard({ ...card, badgeTo: v }); setDirty(true); }} />
                  <Color label="Cinta: texto" value={card.badgeColor} onChange={(v) => { setCard({ ...card, badgeColor: v }); setDirty(true); }} />
                  <Color label="«Ahorras»: fondo" value={card.saveBg} onChange={(v) => { setCard({ ...card, saveBg: v }); setDirty(true); }} />
                  <Color label="«Ahorras»: texto" value={card.saveColor} onChange={(v) => { setCard({ ...card, saveColor: v }); setDirty(true); }} />
                  <Checkbox label="Mostrar el precio de antes tachado" checked={card.showCompare} onChange={(v) => { setCard({ ...card, showCompare: v }); setDirty(true); }} />
                  <Checkbox label="Mostrar «Ahorras X %»" checked={card.showSave} onChange={(v) => { setCard({ ...card, showSave: v }); setDirty(true); }} />
                </BlockStack>
              )}

            </div>
          </div>

          <div className="cod-editor-preview">
            <Preview fields={data.fields} tokens={pvTokens} offers={pvOffers} addons={pvAddons}
              unitPriceCents={pvProduct?.priceCents ?? 0} shipping={data.shipping} focus={tab === 'extras' ? 'addons' : tab === 'qty' ? 'offers' : null}
              hint={pvProduct
                ? `Así se ven en «${pvProduct.title}» (precio en Shopify: ${money(pvProduct.priceCents ?? 0)}). Pulsa las tarjetas para probarlas.`
                : 'Elige el producto de una oferta para verla aquí con su precio real.'} />
          </div>
        </div>

        <CouponModal open={couponModal} onClose={() => setCouponModal(false)} />
        {toast && <SavedToast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}

/* ─────────────── Piezas ─────────────── */

function Item({ open, onToggle, title, subtitle, badges, children, onUp, onDown, showMove }: {
  open: boolean; onToggle: () => void; title: string; subtitle: string; badges: string[]; children: React.ReactNode;
  onUp?: () => void; onDown?: () => void; showMove?: boolean;
}) {
  return (
    <div style={{ border: '1px solid var(--p-color-border-secondary)', borderRadius: 10, background: 'var(--p-color-bg-surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
      {showMove && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8 }}>
          <Button size="micro" variant="tertiary" icon={ArrowUpIcon} disabled={!onUp} onClick={onUp} accessibilityLabel="Subir" />
          <Button size="micro" variant="tertiary" icon={ArrowDownIcon} disabled={!onDown} onClick={onDown} accessibilityLabel="Bajar" />
        </div>
      )}
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <Text as="span" variant="bodyMd" fontWeight="semibold" truncate>{title}</Text>
          <InlineStack gap="100" blockAlign="center">
            <Text as="span" variant="bodySm" tone="subdued">{subtitle}</Text>
            {badges.map((b) => <Badge key={b} size="small">{b}</Badge>)}
          </InlineStack>
        </span>
        <Icon source={open ? ChevronDownIcon : ChevronRightIcon} tone="subdued" />
      </button>
      </div>
      <Collapsible open={open} id={`item-${title}`}>
        <div style={{ padding: '0 12px 14px' }}><BlockStack gap="300">{children}</BlockStack></div>
      </Collapsible>
    </div>
  );
}

const ALL_PROVINCES = { mode: 'all' as const, codes: [] as string[] };
/** Atajo: Santo Domingo y el Distrito Nacional (la capital y sus alrededores). */
const GRAN_SD = ['DO-01', 'DO-32'];
const provName = (c: string) => DO_PROVINCES.find((p) => p.code === c)?.name ?? c;

function provinceBadge(d: ProvinceDraft): string {
  if (d.provMode === 'all' || !d.provCodes.length) return '';
  const names = d.provCodes.length <= 2 ? d.provCodes.map(provName).join(' y ') : `${d.provCodes.length} provincias`;
  return d.provMode === 'only' ? `Solo ${names}` : `Menos ${names}`;
}

/**
 * ¿En qué provincias sale? Todas · Solo en… · Todas menos… La provincia es la
 * que el cliente pone a mano o la de su ubicación en el mapa.
 */
function ProvincePicker({ value, what, onChange }: { value: ProvinceDraft; what: string; onChange: (p: ProvinceDraft) => void }) {
  const sel = new Set(value.provCodes);
  const toggle = (c: string) => onChange({ ...value, provCodes: sel.has(c) ? value.provCodes.filter((x) => x !== c) : [...value.provCodes, c] });
  const allGran = GRAN_SD.every((c) => sel.has(c));
  const names = value.provCodes.map(provName).join(', ');
  return (
    <BlockStack gap="200">
      <Divider />
      <Choice label="¿En qué provincias sale?" value={value.provMode} onChange={(v) => onChange({ ...value, provMode: v as ProvinceDraft['provMode'] })}
        options={[['all', 'Todas'], ['only', 'Solo en…'], ['except', 'Todas menos…']]} />
      {value.provMode !== 'all' && (<>
        <InlineStack gap="200">
          <Button size="slim" pressed={allGran}
            onClick={() => onChange({ ...value, provCodes: allGran ? value.provCodes.filter((c) => !GRAN_SD.includes(c)) : [...new Set([...value.provCodes, ...GRAN_SD])] })}>
            Gran Santo Domingo (D. N. + Santo Domingo)
          </Button>
          {value.provCodes.length > 0 && <Button size="slim" variant="plain" onClick={() => onChange({ ...value, provCodes: [] })}>Quitar todas</Button>}
        </InlineStack>
        <div className="cod-prov-grid">
          {DO_PROVINCES.map((p) => (
            <button key={p.code} type="button" className="cod-prov" aria-pressed={sel.has(p.code)} onClick={() => toggle(p.code)}>{p.name}</button>
          ))}
        </div>
        <Text as="p" variant="bodySm" tone={value.provCodes.length ? 'subdued' : 'critical'}>
          {!value.provCodes.length ? 'Elige al menos una provincia.'
            : value.provMode === 'only'
              ? `${what[0]!.toUpperCase()}${what.slice(1)} solo sale a clientes de: ${names}. Aparece en cuanto el cliente pone su provincia (a mano o con el mapa).`
              : `${what[0]!.toUpperCase()}${what.slice(1)} no sale a clientes de: ${names}. Se quita en cuanto el cliente pone una de esas provincias.`}
        </Text>
      </>)}
    </BlockStack>
  );
}

function ItemFooter({ active, onActive, onDelete }: { active: boolean; onActive: (v: boolean) => void; onDelete: () => void }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Checkbox label="Activa" checked={active} onChange={onActive} />
      <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={onDelete}>Eliminar</Button>
    </InlineStack>
  );
}

function Choice({ label, value, options, onChange }: {
  label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void;
}) {
  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodyMd">{label}</Text>
      <ButtonGroup variant="segmented" fullWidth>
        {options.map(([v, l]) => <Button key={v} size="slim" pressed={value === v} onClick={() => onChange(v)}>{l}</Button>)}
      </ButtonGroup>
    </BlockStack>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <label style={{ position: 'relative', width: 34, height: 34, flexShrink: 0, borderRadius: 8, border: '1px solid #d4d4d4', background: value, cursor: 'pointer', overflow: 'hidden' }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)}
          aria-label={label} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
      </label>
      <div style={{ flex: 1, minWidth: 0 }}><Text as="p" variant="bodyMd">{label}</Text></div>
      <div style={{ width: 96 }}><TextField labelHidden label={label} value={value} onChange={onChange} autoComplete="off" /></div>
    </InlineStack>
  );
}

function CouponModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const submit = useSubmit();
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('PERCENTAGE');
  const [value, setValue] = useState('10');
  const [limit, setLimit] = useState('');
  const [scope, setScope] = useState<ProductScopeDraft>({ scope: 'all', products: [] });
  const missingProducts = scope.scope === 'some' && !scope.products.length;
  const missingValue = type !== 'FREE_SHIPPING' && !(Number(value) > 0);
  const reset = () => { setCode(''); setType('PERCENTAGE'); setValue('10'); setLimit(''); setScope({ scope: 'all', products: [] }); };
  return (
    <Modal open={open} onClose={onClose} title="Crear cupón"
      primaryAction={{
        content: 'Crear', disabled: !code.trim() || missingProducts || missingValue,
        onAction: () => {
          submit({
            intent: 'discount:create', name: code, code, type, value, usageLimit: limit,
            products: JSON.stringify(scope.scope === 'some' ? scope.products : []),
          }, { method: 'post' });
          reset(); onClose();
        },
      }}>
      <Modal.Section>
        <BlockStack gap="300">
          <TextField label="Código" value={code} onChange={(v) => setCode(v.toUpperCase().replace(/\s+/g, ''))} placeholder="BIENVENIDO10" autoComplete="off" />
          <Choice label="Tipo de descuento" value={type}
            onChange={(v) => { setType(v as typeof type); if (v === 'FIXED' && value === '10') setValue(''); }}
            options={[['PERCENTAGE', 'Porcentaje'], ['FIXED', 'Monto fijo'], ['FREE_SHIPPING', 'Envío gratis']]} />
          {type !== 'FREE_SHIPPING' && (
            <TextField label={type === 'PERCENTAGE' ? 'Porcentaje que se descuenta' : 'Monto que se descuenta'} type="number" value={value} onChange={setValue}
              suffix={type === 'PERCENTAGE' ? '%' : undefined} prefix={type === 'FIXED' ? 'RD$' : undefined} autoComplete="off"
              helpText={type === 'FIXED' ? 'Se resta del total de los productos. Ej.: RD$ 200 menos.' : undefined} />
          )}
          <ProductScope value={scope} onChange={(p) => setScope((s) => ({ ...s, ...p }))} />
          <TextField label="Límite de usos (opcional)" type="number" value={limit} onChange={setLimit} autoComplete="off" helpText="Vacío = sin límite." />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

/** «Todos los productos» o «Solo estos productos» (con selector de productos). */
function ProductScope({ value, onChange, required = false }: { value: ProductScopeDraft; onChange: (p: ProductScopeDraft) => void; required?: boolean }) {
  const add = async () => {
    const picked = await pickResources({ type: 'product' });
    const p = picked?.[0];
    if (!p || value.products.some((x) => x.id === p.id)) return;
    const price = p.variants?.[0]?.price;
    onChange({ scope: 'some', products: [...value.products, { id: p.id, title: p.title, priceCents: price ? cents(price) : null }] });
  };
  return (
    <BlockStack gap="200">
      {required
        ? <Text as="span" variant="bodyMd">¿A qué producto se aplica?</Text>
        : <Choice label="¿En qué productos vale?" value={value.scope}
            onChange={(v) => onChange({ scope: v as ProductScopeDraft['scope'], products: value.products })}
            options={[['all', 'Todos los productos'], ['some', 'Solo algunos']]} />}
      {(required || value.scope === 'some') && (
        <BlockStack gap="150">
          {value.products.map((p) => (
            <InlineStack key={p.id} align="space-between" blockAlign="center" wrap={false} gap="200">
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text as="span" variant="bodyMd" fontWeight="semibold" truncate>{p.title}</Text>
                {p.priceCents != null && <Text as="span" variant="bodySm" tone="subdued"> · precio en Shopify {money(p.priceCents)}</Text>}
              </div>
              <Button variant="plain" tone="critical" icon={DeleteIcon} accessibilityLabel={`Quitar ${p.title}`}
                onClick={() => onChange({ scope: 'some', products: value.products.filter((x) => x.id !== p.id) })} />
            </InlineStack>
          ))}
          {!value.products.length && <Text as="p" variant="bodySm" tone="critical">
            {required && value.scope === 'all' ? 'Esta oferta vale para todos los productos. Elige su producto para ver el precio real.' : 'Elige al menos un producto.'}
          </Text>}
          <div><Button icon={PlusIcon} onClick={() => void add()}>{value.products.length ? 'Añadir otro producto' : 'Elegir producto'}</Button></div>
        </BlockStack>
      )}
    </BlockStack>
  );
}

function scopeFrom(ids: string[], titles: unknown, live?: Map<string, { title: string; priceCents: number | null }>): ProductScopeDraft {
  const t = Array.isArray(titles) ? titles : [];
  return ids.length
    ? { scope: 'some', products: ids.map((id, i) => ({
        id,
        title: live?.get(id)?.title ?? (typeof t[i] === 'string' && t[i] ? String(t[i]) : 'Producto'),
        priceCents: live?.get(id)?.priceCents ?? null,
      })) }
    : { scope: 'all', products: [] };
}

const money = (c: number) => `RD$ ${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** Ejemplo con el precio real del producto elegido: «2 × RD$ 1,799 = RD$ 3,598 → pagas RD$ 2,950». */
function priceHint(o: OfferDraft, mode: 'bundle' | 'amount' | 'percent'): string {
  const unit = o.products[0]?.priceCents;
  const qty = Math.max(1, parseInt(o.minQty, 10) || 1);
  if (!unit) return 'Elige el producto para ver el precio real y el ahorro.';
  const full = unit * qty;
  const name = o.products[0]!.title;
  const base = `${qty} × ${money(unit)} (${name}) = ${money(full)}.`;
  const pay = mode === 'bundle' ? (o.bundlePrice ? cents(o.bundlePrice) : null)
    : mode === 'amount' ? (o.amount ? full - cents(o.amount) : null)
    : (o.percent ? Math.round(full * (1 - (Number(o.percent) || 0) / 100)) : null);
  if (pay == null) return `Precio normal: ${base}`;
  if (pay >= full) return `Precio normal: ${base} Con este valor no hay descuento.`;
  return `Precio normal: ${base} Con la oferta paga ${money(Math.max(0, pay))} (ahorra ${money(full - Math.max(0, pay))}).`;
}



function scopeLabel(d: ProductScopeDraft): string {
  if (!d.products.length) return ' · sin producto';
  return d.products.length === 1 ? ` · solo ${d.products[0]!.title}` : ` · ${d.products.length} productos`;
}

const CSS = `
.cod-editor{display:grid;grid-template-columns:minmax(330px,420px) 1fr;gap:16px;align-items:start}
.cod-editor-side{background:var(--p-color-bg-surface);border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,.07),0 0 0 1px rgba(0,0,0,.06);
  display:flex;flex-direction:column;height:calc(100vh - 130px);min-height:520px;overflow:hidden}
.cod-prov-grid{display:flex;flex-wrap:wrap;gap:6px}
.cod-prov{all:unset;box-sizing:border-box;cursor:pointer;padding:5px 10px;border-radius:999px;font-size:12.5px;line-height:1.3;
  border:1px solid var(--p-color-border);background:var(--p-color-bg-surface);color:var(--p-color-text)}
.cod-prov:hover{background:var(--p-color-bg-surface-hover)}
.cod-prov[aria-pressed=true]{background:var(--p-color-bg-fill-brand);color:var(--p-color-text-brand-on-bg-fill);border-color:transparent}
.cod-prov:focus-visible{outline:2px solid var(--p-color-border-focus);outline-offset:1px}
.cod-editor-tabs{border-bottom:1px solid var(--p-color-border-secondary);flex-shrink:0}
.cod-editor-body{padding:14px;overflow:auto;flex:1}
.cod-editor-preview{position:sticky;top:var(--cod-sticky-top,12px);height:calc(100vh - 130px);min-height:520px;border-radius:12px;overflow:hidden;
  box-shadow:0 1px 0 rgba(0,0,0,.07),0 0 0 1px rgba(0,0,0,.06);background:var(--p-color-bg)}
@media (max-width: 860px){
  .cod-editor{grid-template-columns:1fr}
  .cod-editor-side{height:auto;min-height:0}
  .cod-editor-body{overflow:visible}
  .cod-editor-preview{position:relative;top:0;height:640px}
}`;
