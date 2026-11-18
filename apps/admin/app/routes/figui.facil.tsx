import { useEffect, useMemo, useState } from 'react';
import { Banner, Frame } from '@shopify/polaris';
import { SavedToast } from '../components/SavedToast';
import { Link, redirect, useFetcher, useLoaderData } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  FieldSchema, OfferSchema, ShopSettingsSchema, ThemeTokensSchema, type Field, type Offer, type ThemeTokens,
} from '@cod/contracts';
import { requireShop } from '../lib/shop.server';
import { pickResources } from '../lib/base';
import { productInfo } from '../lib/products.server';
import { newField } from '../lib/defaults';
import { db } from '../db.server';
import { Preview } from '../features/builder/Preview';
import { FieldSettings } from '../features/builder/FieldSettings';
import { DesignPanel } from '../features/builder/DesignPanel';
import { ADDABLE_TYPES, CONTENT_TYPES, FIELD_META, GROUPS } from '../features/builder/fieldMeta';
import { IconPicker } from '../components/IconPicker';
import { DisplayPicker, type DisplayMode } from '../components/DisplayPicker';
import {
  PersonIcon, PhoneIcon, EmailIcon, HomeIcon, LocationIcon, NoteIcon, CheckboxIcon, ListBulletedIcon,
  ChevronUpIcon, ChevronDownIcon, DeleteIcon, XIcon, PlusIcon, CheckIcon, ViewIcon, HideIcon, ProductIcon,
  DeliveryIcon, CashDollarIcon, DiscountCodeIcon, CheckCircleIcon, PageIcon, ChatIcon, SaveIcon, ColorIcon, AdjustIcon, ButtonIcon,
} from '@shopify/polaris-icons';

type Ico = typeof PersonIcon;
/** Icono del sistema (mismo trazo y tamaño en todo el editor). */
const Ic = ({ s: S, size = 20 }: { s: Ico; size?: number }) => <S className="ef-ic" width={size} height={size} aria-hidden focusable="false" />;

/**
 * EDITOR FÁCIL (Figui). Tres pasos en una pantalla y un solo botón «Guardar»:
 *   1. Los datos que se piden al cliente (nombre, obligatorio, mostrar, orden).
 *   2. Los botones (textos y color).
 *   3. Precios por cantidad de cada producto («si lleva 2 → RD$ 2,950»).
 * Aquí está TODO: datos, títulos, diseño completo, dónde se muestra, precios…
 */

type PriceRow = { qty: string; price: string };
type Coupon = { id: string | null; code: string; kind: 'PERCENTAGE' | 'FIXED'; value: string };
type AfterOrder = { title: string; message: string; target: 'none' | 'thankyou' | 'whatsapp'; phone: string; waText: string };
type ShipDraft = { mode: 'free' | 'paid'; cost: string; freeOver: string };
type Where = { displayMode: 'EMBEDDED' | 'POPUP'; active: boolean; type: 'ALL' | 'PRODUCT' | 'COLLECTION' | 'TAG' | 'VENDOR'; value: string; label: string };
type ProductPrices = { id: string; title: string; priceCents: number | null; rows: PriceRow[] };

const cents = (v: string) => Math.round((Number(String(v).replace(/[^0-9.]/g, '')) || 0) * 100);
const money = (c: number) => `RD$ ${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

async function themeFor(shopId: string, themeId: string | null) {
  if (themeId) {
    const own = await db.theme.findFirst({ where: { id: themeId, shopId } });
    if (own) return own;
  }
  return (await db.theme.findFirst({ where: { shopId, isDefault: true } }))
    ?? db.theme.create({ data: { shopId, name: 'Tema por defecto', isDefault: true, tokens: {} } });
}

/** Una oferta «fácil»: un solo producto y precio total del paquete. */
const isSimple = (o: Offer) => o.productIds.length === 1 && o.bundlePriceCents != null && o.minQty > 1;

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop, admin } = await requireShop(request);
  const form = await db.form.findFirst({
    where: { shopId: shop.id, status: { not: 'ARCHIVED' } },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: { assignments: true },
  });
  if (!form) throw redirect('/figui?lista=1');
  const as = form.assignments[0];
  const version = form.currentVersionId ? await db.formVersion.findUnique({ where: { id: form.currentVersionId } }) : null;
  const theme = await themeFor(shop.id, form.themeId);

  const rows = await db.offer.findMany({ where: { shopId: shop.id, type: 'QUANTITY' }, orderBy: { priority: 'asc' } });
  const offers = rows.map((r) => ({ row: r, o: OfferSchema.safeParse({ id: r.id, label: r.name, type: 'QUANTITY', ...(r.payload as object) }) }))
    .filter((x) => x.o.success).map((x) => ({ active: x.row.active, o: x.o.data! }));
  const simple = offers.filter((x) => x.active && isSimple(x.o));
  const ids = [...new Set(simple.map((x) => x.o.productIds[0]!))];
  const live = await productInfo(shop, admin, ids);
  const products: ProductPrices[] = ids.map((id) => ({
    id,
    title: live.get(id)?.title ?? 'Producto',
    priceCents: live.get(id)?.priceCents ?? null,
    rows: simple.filter((x) => x.o.productIds[0] === id).sort((a, b) => a.o.minQty - b.o.minQty)
      .map((x) => ({ qty: String(x.o.minQty), price: String((x.o.bundlePriceCents ?? 0) / 100) })),
  }));
  const st = ShopSettingsSchema.parse(shop.settings ?? {});
  const discounts = await db.discount.findMany({ where: { shopId: shop.id, type: { in: ['PERCENTAGE', 'FIXED'] } }, orderBy: { name: 'asc' } });
  const coupons: Coupon[] = discounts
    .filter((d) => d.code && !((d.conditions as { productIds?: unknown[] } | null)?.productIds?.length))
    .map((d) => {
      const p = d.payload as { valueBps?: number; valueCents?: number };
      return { id: d.id, code: d.code!, kind: d.type as Coupon['kind'], value: String(d.type === 'PERCENTAGE' ? (p.valueBps ?? 0) / 100 : (p.valueCents ?? 0) / 100) };
    });
  const c = st.confirmation;

  return {
    coupons,
    ship: { mode: st.defaultShippingCents > 0 ? 'paid' : 'free', cost: st.defaultShippingCents ? String(st.defaultShippingCents / 100) : '', freeOver: st.freeShippingOverCents ? String(st.freeShippingOverCents / 100) : '' } as ShipDraft,
    after: { title: c.title, message: c.message, target: c.redirectTarget, phone: c.whatsapp.phone, waText: c.whatsapp.messageTemplate } as AfterOrder,
    formId: form.id,
    where: {
      displayMode: form.displayMode as 'EMBEDDED' | 'POPUP',
      active: form.status !== 'PAUSED',
      type: (as?.type ?? 'ALL') as Where['type'], value: as?.value ?? '', label: as?.label ?? '',
    } as Where,
    fields: ((version?.schema as Field[] | undefined) ?? []).slice().sort((a, b) => a.order - b.order),
    tokens: ThemeTokensSchema.parse(theme.tokens ?? {}),
    products,
    advancedOffers: offers.filter((x) => x.active && !isSimple(x.o)).length,
    shipping: { defaultShippingCents: st.defaultShippingCents, freeShippingOverCents: st.freeShippingOverCents, codFeeCents: st.codFeeCents },
  };
}

type Result = { ok: boolean; message: string };

/**
 * Al guardar, la pantalla ya tiene lo último: no se vuelve a pedir todo al
 * servidor (menos llamadas a Shopify y nada que se pueda romper después de guardar).
 */
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: { formMethod?: string; defaultShouldRevalidate: boolean }) {
  if (formMethod && formMethod.toUpperCase() === 'POST') return false;
  return defaultShouldRevalidate;
}

export async function action({ request }: ActionFunctionArgs): Promise<Result> {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const body = JSON.parse(String(fd.get('data') || '{}')) as {
    fields: Field[];
    tokens: unknown;
    where?: Where;
    products: ProductPrices[];
    ship?: ShipDraft;
    coupons?: Coupon[];
    after?: AfterOrder;
  };
  const form = await db.form.findFirst({ where: { shopId: shop.id, status: { not: 'ARCHIVED' } }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] });
  if (!form) return { ok: false, message: 'No se encontró el formulario.' };

  // 1) Datos que se piden → versión nueva publicada (se puede volver atrás en avanzadas).
  const parsed = FieldSchema.array().safeParse(body.fields.map((f, i) => ({ ...f, order: i + 1 })));
  if (!parsed.success) return { ok: false, message: 'Hay un dato del formulario sin nombre o con algo raro. Revísalo.' };
  if (parsed.data.some((f) => !['heading', 'subheading', 'divider', 'richtext', 'html', 'image', 'video'].includes(f.type) && !(f.label || f.content).trim())) {
    return { ok: false, message: 'Hay un dato sin nombre. Escríbele un nombre (por ejemplo «Teléfono»).' };
  }
  const keys = new Set<string>();
  for (const f of parsed.data) {
    if (keys.has(f.key)) return { ok: false, message: `Hay dos datos con el mismo nombre interno «${f.key}». Cámbialo en «Ajustes» de uno de ellos.` };
    keys.add(f.key);
  }
  const tokens = ThemeTokensSchema.safeParse(body.tokens);
  if (!tokens.success) return { ok: false, message: 'Algún valor del diseño no es válido. Revísalo.' };
  const where = body.where;
  if (where && where.type !== 'ALL' && !where.value.trim()) {
    return { ok: false, message: 'Elige el producto, la colección, la etiqueta o el proveedor donde se muestra el formulario.' };
  }
  const last = await db.formVersion.findFirst({ where: { formId: form.id }, orderBy: { version: 'desc' } });
  const version = await db.formVersion.create({
    data: { formId: form.id, version: (last?.version ?? 0) + 1, schema: parsed.data as object, publishedAt: new Date() },
  });
  await db.form.update({ where: { id: form.id }, data: { currentVersionId: version.id, ...(body.where ? {} : { status: 'ACTIVE' as const }) } });

  // 2) Diseño (botones, colores, letras…).
  const theme = await themeFor(shop.id, form.themeId);
  await db.theme.update({ where: { id: theme.id }, data: { tokens: tokens.data as object } });
  if (form.themeId !== theme.id) await db.form.update({ where: { id: form.id }, data: { themeId: theme.id } });

  // Dónde y cómo se muestra (y si está activo).
  if (where) {
    const priority = { PRODUCT: 5, COLLECTION: 4, TAG: 3, VENDOR: 2, ALL: 1 }[where.type];
    await db.formAssignment.deleteMany({ where: { formId: form.id } });
    await db.formAssignment.create({ data: { formId: form.id, type: where.type, value: where.type === 'ALL' ? null : where.value.trim(), label: where.label || null, priority } });
    await db.form.update({ where: { id: form.id }, data: { displayMode: where.displayMode === 'EMBEDDED' ? 'EMBEDDED' : 'POPUP', status: where.active ? 'ACTIVE' : 'PAUSED' } });
  }

  // 3) Precios por cantidad: se rehacen las ofertas «fácil» (un producto + precio total).
  for (const p of body.products) {
    for (const r of p.rows) {
      const qty = parseInt(r.qty, 10);
      if (!(qty >= 2 && qty <= 50)) return { ok: false, message: `En «${p.title}», la cantidad tiene que ser de 2 en adelante.` };
      if (!(cents(r.price) > 0)) return { ok: false, message: `En «${p.title}», pon el precio total para ${qty} unidades.` };
    }
  }
  const existing = await db.offer.findMany({ where: { shopId: shop.id, type: 'QUANTITY' } });
  const toDelete = existing.filter((r) => {
    const o = OfferSchema.safeParse({ id: r.id, label: r.name, type: 'QUANTITY', ...(r.payload as object) });
    return o.success && r.active && isSimple(o.data);
  }).map((r) => r.id);
  await db.$transaction([
    db.offer.deleteMany({ where: { id: { in: toDelete }, shopId: shop.id } }),
    ...body.products.flatMap((p) => p.rows.map((r) => {
      const qty = parseInt(r.qty, 10);
      return db.offer.create({
        data: {
          shopId: shop.id, name: `${qty} unidades`, type: 'QUANTITY', priority: qty, active: true,
          payload: {
            minQty: qty, discountBps: 0, freeShipping: false, title: '', subtitle: '', badge: '',
            bundlePriceCents: cents(r.price), preselected: false, discountCents: 0,
            productIds: [p.id], productTitles: [p.title],
          },
        },
      });
    })),
  ]);

  // 4) Envío y 6) después del pedido (ajustes de la tienda).
  if (body.ship || body.after) {
    const fresh = await db.shop.findUniqueOrThrow({ where: { id: shop.id } });
    const st = ShopSettingsSchema.parse(fresh.settings ?? {});
    const next = { ...(fresh.settings as object) } as Record<string, unknown>;
    if (body.ship) {
      next.defaultShippingCents = body.ship.mode === 'paid' ? cents(body.ship.cost) : 0;
      next.freeShippingOverCents = body.ship.mode === 'paid' && cents(body.ship.freeOver) > 0 ? cents(body.ship.freeOver) : null;
      if (body.ship.mode === 'paid' && !(cents(body.ship.cost) > 0)) return { ok: false, message: 'Pon cuánto cobras de envío, o elige «Envío gratis siempre».' };
    }
    if (body.after) {
      const phone = body.after.phone.replace(/\D/g, '');
      if (body.after.target === 'whatsapp' && phone.length < 10) return { ok: false, message: 'Escribe tu número de WhatsApp completo (por ejemplo 18095551234).' };
      next.confirmation = {
        ...st.confirmation,
        title: body.after.title.trim() || st.confirmation.title,
        message: body.after.message.trim(),
        redirectTarget: body.after.target,
        whatsapp: { ...st.confirmation.whatsapp, enabled: body.after.target === 'whatsapp', phone, messageTemplate: body.after.waText.trim() || st.confirmation.whatsapp.messageTemplate },
      };
    }
    const checked = ShopSettingsSchema.safeParse(next);
    if (!checked.success) return { ok: false, message: 'Algún ajuste no es válido. Revísalo.' };
    await db.shop.update({ where: { id: shop.id }, data: { settings: next as object } });
  }

  // 5) Cupones: los de este editor (sin productos) se crean, cambian o borran.
  if (body.coupons) {
    const seen = new Set<string>();
    for (const cp of body.coupons) {
      const code = cp.code.trim().toUpperCase().replace(/\s+/g, '');
      if (!code) return { ok: false, message: 'Hay un cupón sin código. Escríbele un código (por ejemplo BIENVENIDO10).' };
      if (seen.has(code)) return { ok: false, message: `El cupón ${code} está repetido.` };
      seen.add(code);
      const v = Number(cp.value);
      if (!(v > 0)) return { ok: false, message: `Pon cuánto descuenta el cupón ${code}.` };
      if (cp.kind === 'PERCENTAGE' && v > 100) return { ok: false, message: `El cupón ${code} no puede pasar del 100 %.` };
    }
    const mine = await db.discount.findMany({ where: { shopId: shop.id, type: { in: ['PERCENTAGE', 'FIXED'] } } });
    const editable = mine.filter((d) => d.code && !((d.conditions as { productIds?: unknown[] } | null)?.productIds?.length));
    const keep = new Set(body.coupons.map((c) => c.id).filter(Boolean));
    await db.discount.deleteMany({ where: { shopId: shop.id, id: { in: editable.filter((d) => !keep.has(d.id)).map((d) => d.id) } } });
    for (const cp of body.coupons) {
      const code = cp.code.trim().toUpperCase().replace(/\s+/g, '');
      const v = Number(cp.value);
      const fields = {
        name: code, code, type: cp.kind,
        payload: cp.kind === 'PERCENTAGE' ? { valueBps: Math.round(v * 100) } : { valueCents: Math.round(v * 100) },
      };
      await db.discount.upsert({ where: { shopId_code: { shopId: shop.id, code } }, update: fields, create: { shopId: shop.id, ...fields } });
    }
  }

  return { ok: true, message: '¡Guardado! Ya está en tu tienda (puede tardar 1 minuto).' };
}

/* ─────────────────────────── Pantalla ─────────────────────────── */

const ADD: { label: string; icon: Ico; make: (order: number) => Field }[] = [
  { label: 'Nombre', icon: PersonIcon, make: (o) => ({ ...newField('text', o), label: 'Nombre completo', placeholder: 'Tu nombre completo', required: true }) },
  { label: 'Teléfono / WhatsApp', icon: PhoneIcon, make: (o) => ({ ...newField('phone', o), label: 'WhatsApp', placeholder: '809 000 0000', required: true }) },
  { label: 'Correo', icon: EmailIcon, make: (o) => ({ ...newField('email', o), label: 'Correo', placeholder: 'tucorreo@ejemplo.com' }) },
  { label: 'Dirección', icon: HomeIcon, make: (o) => ({ ...newField('textarea', o), label: 'Dirección', placeholder: 'Calle, número, sector…', required: true }) },
  { label: 'Ciudad', icon: LocationIcon, make: (o) => ({ ...newField('text', o), label: 'Ciudad', placeholder: 'Tu ciudad' }) },
  { label: 'Nota', icon: NoteIcon, make: (o) => ({ ...newField('textarea', o), label: 'Nota para el pedido', placeholder: 'Algo que debamos saber' }) },
  { label: 'Casilla «Acepto»', icon: CheckboxIcon, make: (o) => ({ ...newField('checkbox', o), label: '', content: 'Confirmo que recibiré mi pedido.', required: true }) },
  { label: 'Pregunta con opciones', icon: ListBulletedIcon, make: (o) => ({ ...newField('radio', o), label: '¿Qué prefieres?', options: [{ label: 'Opción 1', value: 'opcion-1' }, { label: 'Opción 2', value: 'opcion-2' }] }) },
];


const OFFER_COLORS = ['#4f6b94', '#111111', '#16a34a', '#2563eb', '#dc2626', '#ea580c', '#7c3aed', '#db2777'];
const COLORS = ['#111111', '#16a34a', '#2563eb', '#dc2626', '#ea580c', '#7c3aed', '#db2777', '#0f766e'];

export default function EditorFacil() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<Result>();
  const [fields, setFields] = useState<Field[]>(data.fields);
  // Todo el diseño en un solo objeto: lo usan los controles fáciles y el panel de diseño completo.
  const [tok, setTokRaw] = useState<ThemeTokens>(data.tokens);
  const upTok = (fn: (t: ThemeTokens) => ThemeTokens) => { setTokRaw(fn); setDirty(true); };
  const trigger = tok.trigger.text;
  const setTrigger = (v: string) => upTok((t) => ({ ...t, trigger: { ...t.trigger, text: v } }));
  const triggerSub = tok.trigger.descriptions[0] ?? '';
  const setTriggerSub = (v: string) => upTok((t) => ({ ...t, trigger: { ...t.trigger, descriptions: [v, ...t.trigger.descriptions.slice(1)].filter((d, i) => i > 0 || d.trim()) } }));
  const submitText = tok.submit.text;
  const setSubmitText = (v: string) => upTok((t) => ({ ...t, submit: { ...t.submit, text: v } }));
  const color = tok.submit.bg;
  const setColor = (c: string) => upTok((t) => ({ ...t, trigger: { ...t.trigger, bg: c, bgType: 'solid' }, submit: { ...t.submit, bg: c, bgType: 'solid' } }));
  const showPrice = tok.submit.priceDisplay !== 'none';
  const setShowPrice = (v: boolean) => upTok((t) => ({ ...t, submit: { ...t.submit, priceDisplay: v ? 'total' : 'none' } }));
  const offerColor = tok.offerCard.accent;
  const setOfferColor = (c: string) => upTok((t) => ({ ...t, offerCard: { ...t.offerCard, accent: c } }));
  const offerGlow = tok.offerCard.glow !== false;
  const setOfferGlow = (v: boolean) => upTok((t) => ({ ...t, offerCard: { ...t.offerCard, glow: v } }));
  const triggerIcon = tok.trigger.iconType === 'svg' ? tok.trigger.iconName : tok.trigger.iconType === 'none' ? '' : undefined;
  const setTriggerIcon = (n: string) => upTok((t) => ({ ...t, trigger: { ...t.trigger, ...(n ? { iconType: 'svg' as const, iconName: n } : { iconType: 'none' as const }) } }));
  const submitIcon = tok.submit.iconType === 'svg' ? tok.submit.iconName : tok.submit.iconType === 'none' ? '' : undefined;
  const setSubmitIcon = (n: string) => upTok((t) => ({ ...t, submit: { ...t.submit, ...(n ? { iconType: 'svg' as const, iconName: n } : { iconType: 'none' as const }) } }));
  const display = tok.display;
  const setDisplay = (v: DisplayMode) => upTok((t) => ({ ...t, display: v }));
  // «Ajustes» de diseño abiertos: el del formulario y el de cada botón.
  const [lookOpen, setLookOpen] = useState<'form' | 'trigger' | 'submit' | null>(null);
  const toggleLook = (k: 'form' | 'trigger' | 'submit') => setLookOpen((v) => (v === k ? null : k));
  const noop = () => undefined;
  const [where, setWhere] = useState<Where>(data.where);
  const upWhere = (p: Partial<Where>) => { setWhere((w) => ({ ...w, ...p })); setDirty(true); };
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [products, setProducts] = useState<ProductPrices[]>(data.products);
  const [ship, setShip] = useState<ShipDraft>(data.ship);
  const [coupons, setCoupons] = useState<Coupon[]>(data.coupons);
  const [after, setAfter] = useState<AfterOrder>(data.after);
  const upShip = (p: Partial<ShipDraft>) => { setShip((x) => ({ ...x, ...p })); setDirty(true); };
  const upAfter = (p: Partial<AfterOrder>) => { setAfter((x) => ({ ...x, ...p })); setDirty(true); };
  const upCoupon = (i: number, p: Partial<Coupon>) => { setCoupons((l) => l.map((c, j) => (j === i ? { ...c, ...p } : c))); setDirty(true); };
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const busy = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) { setToast(fetcher.data.message); setDirty(false); }
  }, [fetcher.state, fetcher.data]);

  const touch = () => setDirty(true);
  const setField = (i: number, p: Partial<Field>) => { setFields((l) => l.map((f, j) => (j === i ? { ...f, ...p } : f))); touch(); };
  const move = (i: number, d: -1 | 1) => {
    setFields((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
    touch();
  };
  const remove = (i: number) => { setFields((l) => l.filter((_, j) => j !== i)); touch(); };
  const add = (make: (o: number) => Field) => { const f = make(fields.length + 1); setFields((l) => [...l, f]); setAddOpen(false); touch(); window.setTimeout(() => document.querySelector(`[data-fkey="${f.key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); };

  const addProduct = async () => {
    const picked = await pickResources({ type: 'product' });
    const p = picked?.[0];
    if (!p || products.some((x) => x.id === p.id)) return;
    const price = p.variants?.[0]?.price;
    setProducts((l) => [...l, { id: p.id, title: p.title, priceCents: price ? cents(price) : null, rows: [{ qty: '2', price: '' }, { qty: '3', price: '' }] }]);
    touch();
  };
  const setRow = (pi: number, ri: number, p: Partial<PriceRow>) => {
    setProducts((l) => l.map((x, i) => (i !== pi ? x : { ...x, rows: x.rows.map((r, j) => (j === ri ? { ...r, ...p } : r)) })));
    touch();
  };

  const save = () => fetcher.submit(
    { data: JSON.stringify({ fields, tokens: tok, where, products, ship, coupons, after }) },
    { method: 'post' },
  );

  // Vista previa con lo que se está editando ahora mismo.
  const pvTokens = tok;
  const pvProduct = products[0];
  const pvOffers = useMemo<Offer[]>(() => (pvProduct?.rows ?? []).filter((r) => parseInt(r.qty, 10) >= 2 && cents(r.price) > 0).map((r) => {
    const q = parseInt(r.qty, 10);
    return { id: `pv-${q}`, type: 'QUANTITY', minQty: q, discountBps: 0, discountCents: 0, bundlePriceCents: cents(r.price), freeShipping: false,
      label: `${q} unidades`, title: '', subtitle: '', badge: '', preselected: false, productIds: [] };
  }), [pvProduct]);

  return (
    <Frame>
      <style>{CSS}</style>
      <div className="ef">
        <div className="ef-side">
          <header className="ef-head">
            <div>
              <h1>Edita tu formulario</h1>
              <p>Cambia lo que quieras y pulsa <b>Guardar</b>. En la vista previa lo ves tal cual lo verá tu cliente.</p>
            </div>
            <button type="button" className={`ef-save-btn${dirty ? ' dirty' : ''}`} disabled={busy || !dirty} onClick={save}>
              {!busy && <Ic s={dirty ? SaveIcon : CheckIcon} size={18} />}{busy ? 'Guardando…' : dirty ? 'Guardar' : 'Guardado'}
            </button>
          </header>
          {fetcher.data && !fetcher.data.ok && !busy && <Banner tone="critical">{fetcher.data.message}</Banner>}

          {/* 1 ─ El formulario: datos, títulos y textos */}
          <section className="ef-card">
            <h2><span className="ef-n n1">1</span> Lo que ve y llena el cliente</h2>
            <p className="ef-hint">Datos, títulos, textos e imágenes del formulario. Usa las flechas para cambiar el orden y <b>Ajustes</b> en cada uno para todo lo demás (ancho, icono, color, reglas…).</p>
            <button type="button" className={`ef-pill ef-more ef-lookbtn${lookOpen === 'form' ? ' on' : ''}`} aria-expanded={lookOpen === 'form'} onClick={() => toggleLook('form')}>
              <Ic s={ColorIcon} size={16} />{lookOpen === 'form' ? 'Cerrar ajustes del formulario' : 'Ajustes del formulario: colores, letra, esquinas, espacios'}
            </button>
            {lookOpen === 'form' && (
              <div className="ef-detail ef-lookpanel">
                <DesignPanel tokens={tok} onChange={(t) => upTok(() => t)} open={null} onOpen={noop} only={['colors', 'shape', 'extras']} />
              </div>
            )}
            <ul className="ef-fields">
              {fields.map((f, i) => {
                const isContent = CONTENT_TYPES.includes(f.type);
                const isCheck = f.type === 'checkbox';
                const usesContent = isContent || isCheck;
                const name = usesContent ? f.content : f.label;
                const meta = FIELD_META[f.type];
                const open = openKey === f.key;
                return (
                  <li key={f.key} data-fkey={f.key} className={`ef-field${f.visible ? '' : ' off'}${open ? ' open' : ''}`}>
                    <div className="ef-move">
                      <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><Ic s={ChevronUpIcon} /></button>
                      <button type="button" aria-label="Bajar" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><Ic s={ChevronDownIcon} /></button>
                    </div>
                    <div className="ef-main">
                      <span className="ef-kind">{meta?.icon && <Ic s={meta.icon} size={14} />}{meta?.label ?? f.type}{f.conditions.length ? ' · con reglas' : ''}</span>
                      {f.type === 'divider' ? (
                        <span className="ef-divider-line" aria-label="Línea separadora" />
                      ) : f.type === 'richtext' || f.type === 'html' ? (
                        <textarea className="ef-input ef-opts" rows={3} value={f.content} aria-label={meta?.label}
                          placeholder={f.type === 'html' ? 'Código HTML' : 'Escribe el texto'} onChange={(e) => setField(i, { content: e.target.value })} />
                      ) : (
                        <input className="ef-input" value={name} aria-label="Nombre del dato"
                          placeholder={f.type === 'image' ? 'Enlace (URL) de la imagen' : f.type === 'video' ? 'Enlace del video' : isCheck ? 'Texto de la casilla' : isContent ? 'Escribe el texto' : 'Nombre del dato'}
                          onChange={(e) => setField(i, usesContent ? { content: e.target.value } : { label: e.target.value })} />
                      )}
                      {(f.type === 'radio' || f.type === 'multiselect' || (f.type === 'select' && f.options.length <= 12)) && (
                        <textarea className="ef-input ef-opts" rows={Math.max(2, f.options.length)} aria-label="Opciones"
                          value={f.options.map((o) => o.label).join('\n')}
                          onChange={(e) => setField(i, { options: e.target.value.split('\n').map((l, k) => ({ label: l, value: l.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || `opcion-${k + 1}` })) })} />
                      )}
                      <div className="ef-toggles">
                        {!isContent && (
                          <label className={`ef-pill${f.required ? ' on' : ''}`}>
                            <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                            {f.required && <Ic s={CheckIcon} size={16} />}{f.required ? 'Obligatorio' : 'Opcional'}
                          </label>
                        )}
                        <label className={`ef-pill${f.visible ? ' on' : ''}`}>
                          <input type="checkbox" checked={f.visible} onChange={(e) => setField(i, { visible: e.target.checked })} />
                          <Ic s={f.visible ? ViewIcon : HideIcon} size={16} />{f.visible ? 'Se ve' : 'Oculto'}
                        </label>
                        <button type="button" className={`ef-pill ef-more${open ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpenKey(open ? null : f.key)}>
                          <Ic s={AdjustIcon} size={16} />{open ? 'Cerrar ajustes' : 'Ajustes'}
                        </button>
                      </div>
                      {open && (
                        <div className="ef-detail">
                          <FieldSettings field={f} allFields={fields}
                            onChange={(nf) => { setFields((l) => l.map((x) => (x.key === f.key ? nf : x))); if (nf.key !== f.key) setOpenKey(nf.key); touch(); }}
                            onBack={() => setOpenKey(null)}
                            onRemove={() => { setOpenKey(null); remove(i); }}
                            onMove={(d) => move(i, d)}
                            tokens={tok} onTokens={(t) => upTok(() => t)} />
                        </div>
                      )}
                    </div>
                    <button type="button" className="ef-del" aria-label={`Quitar ${name || meta?.label}`} onClick={() => remove(i)}><Ic s={DeleteIcon} /></button>
                  </li>
                );
              })}
            </ul>
            <p className="ef-sub">Añadir rápido</p>
            <div className="ef-add">
              {ADD.map((a) => (
                <button type="button" key={a.label} onClick={() => add(a.make)}><span className="ef-add-ic"><Ic s={a.icon} /></span>{a.label}</button>
              ))}
            </div>
            <button type="button" className="ef-link" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
              <Ic s={addOpen ? ChevronUpIcon : PlusIcon} size={18} />{addOpen ? 'Ocultar' : 'Más cosas para añadir: títulos, textos, imágenes, fechas…'}
            </button>
            {addOpen && GROUPS.map((g) => {
              const types = ADDABLE_TYPES.filter((t) => FIELD_META[t].group === g.id);
              if (!types.length) return null;
              return (
                <div key={g.id}>
                  <p className="ef-sub sm">{g.title}</p>
                  <div className="ef-add">
                    {types.map((t) => (
                      <button type="button" key={t} title={FIELD_META[t].hint} onClick={() => add((o) => newField(t, o))}>
                        <span className="ef-add-ic"><Ic s={FIELD_META[t].icon} /></span>{FIELD_META[t].label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          {/* 2 ─ Botones */}
          <section className="ef-card">
            <h2><span className="ef-n n2">2</span> Los botones y la ventana</h2>
            <label className="ef-label">Botón para abrir el formulario
              <input className="ef-input" value={trigger} onChange={(e) => { setTrigger(e.target.value); touch(); }} placeholder="Comprar ahora" />
            </label>
            <label className="ef-label">Frase pequeña debajo (opcional)
              <input className="ef-input" value={triggerSub} onChange={(e) => { setTriggerSub(e.target.value); touch(); }} placeholder="Pagas al recibir" />
            </label>
            <span className="ef-label">Icono del botón para abrir el formulario</span>
            <IconPicker label="Icono del botón para abrir el formulario" value={triggerIcon ?? ''} onChange={(n) => { setTriggerIcon(n); touch(); }} />
            <label className="ef-label">Botón para confirmar el pedido
              <input className="ef-input" value={submitText} onChange={(e) => { setSubmitText(e.target.value); touch(); }} placeholder="Finalizar pedido" />
            </label>
            <span className="ef-label">Icono del botón para confirmar</span>
            <IconPicker label="Icono del botón para confirmar" value={submitIcon ?? ''} onChange={(n) => { setSubmitIcon(n); touch(); }} />
            <span className="ef-label">Color de los botones</span>
            <div className="ef-colors" role="radiogroup" aria-label="Color de los botones">
              {COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={color.toLowerCase() === c} aria-label={c}
                  className={color.toLowerCase() === c ? 'on' : ''} style={{ background: c }} onClick={() => { setColor(c); touch(); }} />
              ))}
              <label className="ef-custom" title="Otro color">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#111111'} onChange={(e) => { setColor(e.target.value); touch(); }} /><Ic s={ColorIcon} />
              </label>
            </div>
            <label className={`ef-pill big${showPrice ? ' on' : ''}`}>
              <input type="checkbox" checked={showPrice} onChange={(e) => { setShowPrice(e.target.checked); touch(); }} />
              {showPrice && <Ic s={CheckIcon} size={16} />}Mostrar el total en el botón de confirmar
            </label>
            <span className="ef-label">¿Cómo aparece el formulario al tocar el botón?</span>
            <DisplayPicker value={display} onChange={(v) => { setDisplay(v); touch(); }} />
            <div className="ef-morebtns">
              <button type="button" className={`ef-pill ef-more${lookOpen === 'trigger' ? ' on' : ''}`} aria-expanded={lookOpen === 'trigger'} onClick={() => toggleLook('trigger')}>
                <Ic s={AdjustIcon} size={16} />Ajustes del botón para abrir: colores, tamaño, letra, esquinas, sombra, animación
              </button>
              {lookOpen === 'trigger' && (
                <div className="ef-detail ef-lookpanel">
                  <DesignPanel tokens={tok} onChange={(t) => upTok(() => t)} open={null} onOpen={noop} only={['trigger']} />
                </div>
              )}
              <button type="button" className={`ef-pill ef-more${lookOpen === 'submit' ? ' on' : ''}`} aria-expanded={lookOpen === 'submit'} onClick={() => toggleLook('submit')}>
                <Ic s={AdjustIcon} size={16} />Ajustes del botón para confirmar: colores, tamaño, letra, esquinas, sombra, animación
              </button>
              {lookOpen === 'submit' && (
                <div className="ef-detail ef-lookpanel">
                  <DesignPanel tokens={tok} onChange={(t) => upTok(() => t)} open={null} onOpen={noop} only={['submit']} />
                </div>
              )}
            </div>
          </section>

          {/* 3 ─ Dónde se muestra */}
          <section className="ef-card">
            <h2><span className="ef-n n3">3</span> Dónde y cómo se muestra</h2>
            <label className={`ef-pill big${where.active ? ' on' : ''}`}>
              <input type="checkbox" checked={where.active} onChange={(e) => upWhere({ active: e.target.checked })} />
              <Ic s={where.active ? CheckIcon : HideIcon} size={16} />{where.active ? 'El formulario está activo en tu tienda' : 'El formulario está pausado (no se ve en la tienda)'}
            </label>
            <span className="ef-label">¿Cómo lo ve el cliente en la página del producto?</span>
            <div className="ef-seg col" role="radiogroup" aria-label="Cómo se muestra">
              <button type="button" role="radio" aria-checked={where.displayMode === 'POPUP'} className={where.displayMode === 'POPUP' ? 'on' : ''} onClick={() => upWhere({ displayMode: 'POPUP' })}><Ic s={ButtonIcon} />Un botón que abre el formulario</button>
              <button type="button" role="radio" aria-checked={where.displayMode === 'EMBEDDED'} className={where.displayMode === 'EMBEDDED' ? 'on' : ''} onClick={() => upWhere({ displayMode: 'EMBEDDED' })}><Ic s={PageIcon} />El formulario completo en la página</button>
            </div>
            <span className="ef-label">¿En qué productos?</span>
            <div className="ef-seg col" role="radiogroup" aria-label="En qué productos">
              {([['ALL', 'En todos los productos'], ['PRODUCT', 'Solo en un producto'], ['COLLECTION', 'En una colección'], ['TAG', 'En productos con una etiqueta'], ['VENDOR', 'En productos de un proveedor']] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={where.type === v} className={where.type === v ? 'on' : ''} onClick={() => upWhere({ type: v, value: v === where.type ? where.value : '', label: v === where.type ? where.label : '' })}>{l}</button>
              ))}
            </div>
            {(where.type === 'PRODUCT' || where.type === 'COLLECTION') && (
              <button type="button" className="ef-btn-ghost" onClick={async () => {
                const picked = await pickResources({ type: where.type === 'PRODUCT' ? 'product' : 'collection' });
                const x = picked?.[0]; if (x) upWhere({ value: x.id, label: x.title });
              }}><Ic s={ProductIcon} />{where.label || `Elegir ${where.type === 'PRODUCT' ? 'el producto' : 'la colección'}`}</button>
            )}
            {(where.type === 'TAG' || where.type === 'VENDOR') && (
              <label className="ef-label">{where.type === 'TAG' ? 'Etiqueta' : 'Proveedor'}
                <input className="ef-input" value={where.value} onChange={(e) => upWhere({ value: e.target.value, label: e.target.value })} placeholder={where.type === 'TAG' ? 'Ej. contraentrega' : 'Ej. Mi marca'} />
              </label>
            )}
          </section>

          {/* 3 ─ Precios */}
          <section className="ef-card">
            <h2><span className="ef-n n4">4</span> Precios por cantidad</h2>
            <p className="ef-hint">Pon cuánto cobras en total si el cliente lleva 2, 3… unidades. Si tu página de producto ya tiene su caja de ofertas, se usan esos precios y aquí no tienes que poner nada.</p>
            {products.map((p, pi) => (
              <div key={p.id} className="ef-prod">
                <div className="ef-prod-head">
                  <div><b>{p.title}</b>{p.priceCents != null && <small>Precio normal: {money(p.priceCents)} c/u</small>}</div>
                  <button type="button" className="ef-del" aria-label={`Quitar precios de ${p.title}`}
                    onClick={() => { setProducts((l) => l.filter((_, i) => i !== pi)); touch(); }}><Ic s={DeleteIcon} /></button>
                </div>
                {p.rows.map((r, ri) => {
                  const q = parseInt(r.qty, 10) || 0;
                  const full = p.priceCents != null ? p.priceCents * q : null;
                  const pay = cents(r.price);
                  return (
                    <div key={ri} className="ef-row">
                      <span>Si lleva</span>
                      <input className="ef-input ef-qty" inputMode="numeric" value={r.qty} aria-label="Unidades" onChange={(e) => setRow(pi, ri, { qty: e.target.value.replace(/\D/g, '') })} />
                      <span>unidades, cobra</span>
                      <div className="ef-money"><i>RD$</i><input className="ef-input" inputMode="decimal" value={r.price} aria-label="Precio total" placeholder="0" onChange={(e) => setRow(pi, ri, { price: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
                      <button type="button" className="ef-x" aria-label="Quitar esta cantidad"
                        onClick={() => { setProducts((l) => l.map((x, i) => (i !== pi ? x : { ...x, rows: x.rows.filter((_, j) => j !== ri) }))); touch(); }}><Ic s={XIcon} size={18} /></button>
                      {full != null && pay > 0 && (
                        <small className={pay < full ? 'ef-save' : 'ef-warn'}>
                          {pay < full ? `Ahorra ${money(full - pay)} (normal ${money(full)})` : `Es igual o más que el precio normal (${money(full)})`}
                        </small>
                      )}
                    </div>
                  );
                })}
                <button type="button" className="ef-link" onClick={() => {
                  const next = Math.max(1, ...p.rows.map((r) => parseInt(r.qty, 10) || 1)) + 1;
                  setProducts((l) => l.map((x, i) => (i !== pi ? x : { ...x, rows: [...x.rows, { qty: String(next), price: '' }] }))); touch();
                }}><Ic s={PlusIcon} size={18} />Añadir otra cantidad</button>
              </div>
            ))}
            <button type="button" className="ef-btn-ghost" onClick={() => void addProduct()}><Ic s={ProductIcon} />Poner precios a un producto</button>
            <span className="ef-label">Color del contorno de la oferta elegida</span>
            <div className="ef-colors" role="radiogroup" aria-label="Color del contorno de la oferta elegida">
              {OFFER_COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={offerColor.toLowerCase() === c} aria-label={c}
                  className={offerColor.toLowerCase() === c ? 'on' : ''} style={{ background: c }} onClick={() => { setOfferColor(c); touch(); }} />
              ))}
              <label className="ef-custom" title="Otro color">
                <input type="color" aria-label="Otro color" value={/^#[0-9a-f]{6}$/i.test(offerColor) ? offerColor : '#4f6b94'} onChange={(e) => { setOfferColor(e.target.value); touch(); }} /><Ic s={ColorIcon} />
              </label>
            </div>
            <label className={`ef-pill big${offerGlow ? ' on' : ''}`}>
              <input type="checkbox" checked={offerGlow} onChange={(e) => { setOfferGlow(e.target.checked); touch(); }} />
              {offerGlow && <Ic s={CheckIcon} size={16} />}Brillo suave alrededor de la oferta elegida
            </label>
            {data.advancedOffers > 0 && (
              <p className="ef-hint">Tienes {data.advancedOffers} oferta(s) avanzada(s) (porcentaje, varios productos…). Siguen igual; se cambian en <Link to="/figui/offers">Ofertas y descuentos</Link>.</p>
            )}
          </section>

          {/* 4 ─ Envío */}
          <section className="ef-card">
            <h2><span className="ef-n n5">5</span> Envío</h2>
            <div className="ef-seg" role="radiogroup" aria-label="Envío">
              <button type="button" role="radio" aria-checked={ship.mode === 'free'} className={ship.mode === 'free' ? 'on' : ''} onClick={() => upShip({ mode: 'free' })}><Ic s={DeliveryIcon} />Envío gratis siempre</button>
              <button type="button" role="radio" aria-checked={ship.mode === 'paid'} className={ship.mode === 'paid' ? 'on' : ''} onClick={() => upShip({ mode: 'paid' })}><Ic s={CashDollarIcon} />Cobrar envío</button>
            </div>
            {ship.mode === 'paid' && (
              <>
                <label className="ef-label">¿Cuánto cobras de envío?
                  <div className="ef-money"><i>RD$</i><input className="ef-input" inputMode="decimal" value={ship.cost} placeholder="250" onChange={(e) => upShip({ cost: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
                </label>
                <label className="ef-label">Envío gratis si la compra pasa de… (opcional)
                  <div className="ef-money"><i>RD$</i><input className="ef-input" inputMode="decimal" value={ship.freeOver} placeholder="Déjalo vacío si no" onChange={(e) => upShip({ freeOver: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
                </label>
              </>
            )}
            <p className="ef-hint" style={{ marginTop: 10 }}>¿Un precio distinto por provincia? Eso está en <Link to="/figui/shipping">Envíos por provincia</Link>.</p>
          </section>

          {/* 5 ─ Cupones */}
          <section className="ef-card">
            <h2><span className="ef-n n6">6</span> Cupones de descuento</h2>
            <p className="ef-hint">Códigos que el cliente escribe en el formulario. Los cupones que ya tienes en Shopify también funcionan.</p>
            {coupons.map((cp, i) => (
              <div key={cp.id ?? `n${i}`} className="ef-coupon">
                <div className="ef-row">
                  <span className="ef-w">Código</span>
                  <input className="ef-input ef-code" value={cp.code} placeholder="BIENVENIDO10" aria-label="Código"
                    onChange={(e) => upCoupon(i, { code: e.target.value.toUpperCase().replace(/\s+/g, '') })} />
                  <button type="button" className="ef-del" aria-label={`Borrar cupón ${cp.code}`} onClick={() => { setCoupons((l) => l.filter((_, j) => j !== i)); setDirty(true); }}><Ic s={DeleteIcon} /></button>
                </div>
                <div className="ef-row">
                  <span className="ef-w">Descuenta</span>
                  <input className="ef-input ef-qty" inputMode="decimal" value={cp.value} aria-label="Cuánto"
                    onChange={(e) => upCoupon(i, { value: e.target.value.replace(/[^0-9.]/g, '') })} />
                  <div className="ef-seg small" role="radiogroup" aria-label="Tipo">
                    <button type="button" role="radio" aria-checked={cp.kind === 'PERCENTAGE'} className={cp.kind === 'PERCENTAGE' ? 'on' : ''} onClick={() => upCoupon(i, { kind: 'PERCENTAGE' })}>%</button>
                    <button type="button" role="radio" aria-checked={cp.kind === 'FIXED'} className={cp.kind === 'FIXED' ? 'on' : ''} onClick={() => upCoupon(i, { kind: 'FIXED' })}>RD$</button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="ef-btn-ghost" onClick={() => { setCoupons((l) => [...l, { id: null, code: '', kind: 'PERCENTAGE', value: '10' }]); setDirty(true); }}><Ic s={DiscountCodeIcon} />Crear un cupón</button>
          </section>

          {/* 6 ─ Después del pedido */}
          <section className="ef-card">
            <h2><span className="ef-n n7">7</span> Después del pedido</h2>
            <p className="ef-hint">Lo que ve el cliente al terminar. Escribe tu propio título y mensaje.</p>
            <div className="ef-done-pv" aria-label="Así se ve la pantalla final">
              <span className="ef-done-tick"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
              <b>{after.title.trim() || '¡Pedido confirmado!'}</b>
              {after.message.trim() && <span>{after.message}</span>}
              {after.target !== 'none' && <i className="ef-done-bar" />}
            </div>
            <label className="ef-label">Título
              <input className="ef-input" value={after.title} onChange={(e) => upAfter({ title: e.target.value })} placeholder="¡Pedido confirmado!" />
            </label>
            <label className="ef-label">Mensaje (opcional)
              <textarea className="ef-input ef-opts" rows={2} value={after.message} onChange={(e) => upAfter({ message: e.target.value })} placeholder="Te contactamos por WhatsApp para coordinar la entrega." />
            </label>
            <span className="ef-label">Luego, el cliente…</span>
            <div className="ef-seg col" role="radiogroup" aria-label="Después del pedido">
              <button type="button" role="radio" aria-checked={after.target === 'none'} className={after.target === 'none' ? 'on' : ''} onClick={() => upAfter({ target: 'none' })}><Ic s={CheckCircleIcon} />Se queda viendo el mensaje</button>
              <button type="button" role="radio" aria-checked={after.target === 'thankyou'} className={after.target === 'thankyou' ? 'on' : ''} onClick={() => upAfter({ target: 'thankyou' })}><Ic s={PageIcon} />Va a «Estado del pedido»</button>
              <button type="button" role="radio" aria-checked={after.target === 'whatsapp'} className={after.target === 'whatsapp' ? 'on' : ''} onClick={() => upAfter({ target: 'whatsapp' })}><Ic s={ChatIcon} />Te escribe por WhatsApp y queda en «Estado del pedido»</button>
            </div>
            {after.target !== 'none' && (
              <p className="ef-hint">{after.target === 'whatsapp'
                ? 'Se abre WhatsApp con el mensaje ya escrito. Cuando el cliente vuelve al navegador, está en la página «Estado del pedido» de su compra.'
                : 'Al terminar la barra, el cliente pasa a la página «Estado del pedido» de su compra.'}</p>
            )}
            {after.target === 'whatsapp' && (
              <>
                <label className="ef-label">Tu número de WhatsApp (con el 1 delante)
                  <input className="ef-input" inputMode="tel" value={after.phone} placeholder="18095551234" onChange={(e) => upAfter({ phone: e.target.value.replace(/[^0-9]/g, '') })} />
                </label>
                <label className="ef-label">Mensaje que te llega (puedes usar {'{nombre}'})
                  <input className="ef-input" value={after.waText} onChange={(e) => upAfter({ waText: e.target.value })} />
                </label>
              </>
            )}
          </section>

                  </div>

        {dirty && (
          <button type="button" className="ef-save-btn dirty ef-float-save" disabled={busy} onClick={save}>
            {!busy && <Ic s={SaveIcon} size={18} />}{busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
        <div className="ef-preview">
          <Preview fields={fields} tokens={pvTokens} offers={pvOffers} unitPriceCents={pvProduct?.priceCents ?? 0}
            shipping={{ ...data.shipping, defaultShippingCents: ship.mode === 'paid' ? cents(ship.cost) : 0, freeShippingOverCents: ship.mode === 'paid' && cents(ship.freeOver) > 0 ? cents(ship.freeOver) : null }}
            showTrigger focus={null}
            hint={pvProduct ? `Precios de «${pvProduct.title}».` : 'Así lo ve tu cliente.'} />
        </div>
      </div>
      {toast && <SavedToast content={toast} onDismiss={() => setToast(null)} />}
    </Frame>
  );
}

const CSS = `
.ef{
  /* Seleccionado: grafito (nada de azul que canse). Guardar: verde. */
  --sel-grad:linear-gradient(180deg,#3B4252 0%,#1F242E 100%);
  --sel-glow:0 8px 16px -8px rgba(17,24,39,.55),0 2px 4px rgba(17,24,39,.14),inset 0 1px 0 rgba(255,255,255,.14);
  --sel-ink:#fff;--focus:#6B7280;--focus-ring:rgba(107,114,128,.18);--hover-line:#C9CED6;
  --green-grad:linear-gradient(180deg,#34D07A 0%,#16A34A 100%);
  --green-glow:0 10px 22px -8px rgba(22,163,74,.6),0 2px 4px rgba(22,163,74,.2),inset 0 1px 0 rgba(255,255,255,.28);
  --soft-grad:linear-gradient(180deg,#FFFFFF 0%,#F6F8FB 100%);
  --soft-shadow:0 1px 2px rgba(16,24,40,.06),0 3px 8px -3px rgba(16,24,40,.10),inset 0 1px 0 #fff;
  --soft-shadow-hover:0 2px 4px rgba(16,24,40,.06),0 8px 16px -6px rgba(16,24,40,.14),inset 0 1px 0 #fff;
  --line:#E3E7ED;--ink:#0A1120;--muted:#667085;--page:#F2F4F8;
  display:grid;grid-template-columns:minmax(0,560px) minmax(0,1fr);gap:18px;align-items:start;padding:16px;max-width:1240px;margin:0 auto;
  font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:var(--ink)}
.ef-ic{width:20px;height:20px;fill:currentColor;flex:none}
.ef button{transition:transform .12s ease,box-shadow .15s ease,filter .15s ease}
.ef button:active{transform:translateY(1px)}
.ef-side{display:flex;flex-direction:column;gap:14px;min-width:0;padding-bottom:24px}
.ef-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.ef-float-save{position:fixed;right:20px;bottom:20px;z-index:30;animation:ef-pop .25s cubic-bezier(.34,1.4,.64,1)}
@keyframes ef-pop{from{transform:scale(.8);opacity:0}to{transform:none;opacity:1}}
.ef-head h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-.01em}
.ef-head p{margin:6px 0 0;color:#475467;font-size:15px;line-height:1.45}
.ef-card{background:#fff;border-radius:18px;padding:18px;border:1px solid var(--line);box-shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px -12px rgba(16,24,40,.12)}
.ef-card h2{display:flex;align-items:center;gap:10px;margin:0 0 6px;font-size:19px;font-weight:800}
.ef-n{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--n,var(--sel-grad));box-shadow:0 6px 14px -6px var(--nc,rgba(17,24,39,.5)),inset 0 1px 0 rgba(255,255,255,.25);color:#fff;font-size:15px;flex:none}
/* Cada sección con su color, para ubicarse rápido */
.ef-n.n1{--n:linear-gradient(180deg,#9F7AEA,#7C3AED);--nc:rgba(124,58,237,.55)}
.ef-n.n2{--n:linear-gradient(180deg,#2DD4BF,#0D9488);--nc:rgba(13,148,136,.55)}
.ef-n.n3{--n:linear-gradient(180deg,#FBBF24,#D97706);--nc:rgba(217,119,6,.55)}
.ef-n.n4{--n:linear-gradient(180deg,#FB7185,#E11D48);--nc:rgba(225,29,72,.5)}
.ef-n.n5{--n:linear-gradient(180deg,#34D399,#059669);--nc:rgba(5,150,105,.55)}
.ef-n.n6{--n:linear-gradient(180deg,#FB923C,#EA580C);--nc:rgba(234,88,12,.55)}
.ef-n.n7{--n:linear-gradient(180deg,#F472B6,#DB2777);--nc:rgba(219,39,119,.5)}
.ef-hint{margin:0 0 12px;color:var(--muted);font-size:14px;line-height:1.45}
.ef-hint a{color:var(--ink);font-weight:700;text-decoration:underline;text-underline-offset:2px}
.ef-done-pv{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:18px 14px;margin:0 0 14px;border-radius:14px;border:1px dashed var(--line);background:#f8fafc}
.ef-done-pv b{font-size:17px;color:#111827}.ef-done-pv span{font-size:13.5px;color:#4b5563;line-height:1.45;white-space:pre-line}
.ef-done-tick{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 6px 16px -6px rgba(22,163,74,.6)}
.ef-done-tick svg{width:22px;height:22px}
.ef-done-bar{display:block;width:70%;height:4px;border-radius:4px;margin-top:6px;background:linear-gradient(90deg,#16a34a 55%,#e5e7eb 55%)}
.ef-fields{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.ef-field{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:14px;padding:10px;background:var(--soft-grad);box-shadow:var(--soft-shadow)}
.ef-field.off{opacity:.55}
.ef-move{display:flex;flex-direction:column;gap:5px}
.ef-move button{display:grid;place-items:center;width:38px;height:31px;border:1px solid var(--line);border-radius:9px;background:var(--soft-grad);box-shadow:var(--soft-shadow);font-size:12px;cursor:pointer;color:#344054}
.ef-move button:hover:not(:disabled){box-shadow:var(--soft-shadow-hover)}
.ef-move button:disabled{opacity:.35;cursor:default;box-shadow:none}
.ef-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.ef-kind{font-size:12px;font-weight:700;color:#98A2B3;text-transform:uppercase;letter-spacing:.04em}
.ef-input{width:100%;box-sizing:border-box;border:1px solid #D0D5DD;border-radius:11px;padding:11px 12px;font:inherit;font-size:16px;background:#fff;color:var(--ink);outline:none;box-shadow:inset 0 1px 2px rgba(16,24,40,.05)}
.ef-input:focus{border-color:var(--focus);box-shadow:0 0 0 3px var(--focus-ring)}
.ef-opts{resize:vertical;font-size:15px;line-height:1.5}
.ef-toggles{display:flex;gap:8px;flex-wrap:wrap}
.ef-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:var(--soft-grad);box-shadow:var(--soft-shadow);font-size:14px;font-weight:600;cursor:pointer;user-select:none;color:#475467;transition:box-shadow .15s ease}
.ef-pill:hover{box-shadow:var(--soft-shadow-hover)}
.ef-pill input{position:absolute;opacity:0;pointer-events:none}
.ef-pill.on{background:var(--sel-grad);border-color:transparent;color:var(--sel-ink);box-shadow:var(--sel-glow)}
.ef-pill.big{margin-top:12px;padding:12px 16px;font-size:15px}
.ef-del{display:grid;place-items:center;color:#D92D20;border:1px solid #FECDCA;background:linear-gradient(180deg,#FFF6F5,#FEE4E2);box-shadow:0 1px 2px rgba(180,35,24,.08),inset 0 1px 0 #fff;width:40px;height:40px;border-radius:11px;font-size:17px;cursor:pointer;flex:none}
.ef-sub{margin:16px 0 8px;font-weight:800;font-size:15px}
.ef-sub.sm{margin:12px 0 6px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.ef-kind{display:inline-flex;align-items:center;gap:5px}
.ef-divider-line{display:block;height:2px;margin:10px 0;border-radius:2px;background:var(--line)}
.ef-more{font:inherit;font-size:14px;font-weight:600}
.ef-field.open{border-color:var(--hover-line)}
.ef-detail{margin-top:8px;padding:14px;border-radius:14px;background:var(--detail,#fff);border:1px solid var(--line)}
html.cod-dark .ef-detail{--detail:#10141a}
.ef-morebtns{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.ef-morebtns .ef-btn-ghost{justify-content:flex-start;font-size:14px}
.ef-morebtns .ef-more,.ef-lookbtn{justify-content:flex-start;text-align:left;width:100%;padding:11px 14px;border-radius:12px}
.ef-lookbtn{margin:0 0 12px}
.ef-lookpanel{margin:0 0 10px}
.ef-add{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ef-add button{display:flex;align-items:center;gap:8px;padding:13px 12px;border:1px solid var(--line);border-radius:13px;background:var(--soft-grad);box-shadow:var(--soft-shadow);font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-align:left;color:var(--ink)}
.ef-add button:hover{box-shadow:var(--soft-shadow-hover);border-color:var(--hover-line)}
.ef-add-ic{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:#F2F4F7;color:#344054;flex:none}
.ef-label{display:flex;flex-direction:column;gap:6px;margin:10px 0 0;font-size:14px;font-weight:700;color:#344054}
.ef-colors{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.ef-colors button,.ef-custom{width:42px;height:42px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px #D0D5DD,0 4px 10px -4px rgba(16,24,40,.25),inset 0 1px 0 rgba(255,255,255,.3);cursor:pointer}
.ef-colors button.on{box-shadow:0 0 0 3px #1F242E,0 6px 14px -4px rgba(17,24,39,.45)}
.ef-custom{display:grid;place-items:center;background:var(--soft-grad);color:#475467;position:relative;overflow:hidden}
.ef-custom input{position:absolute;inset:0;opacity:0;cursor:pointer}
.ef-seg{display:flex;gap:6px;padding:5px;border-radius:14px;background:#F2F4F7;box-shadow:inset 0 1px 2px rgba(16,24,40,.08);flex-wrap:wrap}
.ef-seg.col{flex-direction:column}
.ef-seg button{display:flex;align-items:center;justify-content:center;gap:8px;flex:1;min-width:0;padding:11px 12px;border:0;border-radius:10px;background:transparent;font:inherit;font-size:15px;font-weight:700;color:#475467;cursor:pointer;text-align:center}
.ef-seg.col button{justify-content:flex-start;text-align:left}
.ef-seg button.on{background:var(--sel-grad);color:var(--sel-ink);box-shadow:var(--sel-glow)}
.ef-seg.small{padding:3px;flex:none}
.ef-seg.small button{padding:8px 11px;font-size:14px}
.ef-prod,.ef-coupon{border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;background:var(--soft-grad);box-shadow:var(--soft-shadow)}
.ef-coupon{padding:4px 12px}
.ef-coupon .ef-row:first-child{border-top:0}
.ef-w{min-width:78px}
.ef-prod-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}
.ef-prod-head b{display:block;font-size:16px}
.ef-prod-head small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.ef-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0;border-top:1px dashed var(--line);font-size:15px;font-weight:600}
.ef-qty{width:70px!important;text-align:center}
.ef-code{flex:1;min-width:140px;width:auto!important;text-transform:uppercase}
.ef-money{display:flex;align-items:center;border:1px solid #D0D5DD;border-radius:11px;background:#fff;padding-left:10px;flex:1;min-width:120px;box-shadow:inset 0 1px 2px rgba(16,24,40,.05)}
.ef-money:focus-within{border-color:var(--focus);box-shadow:0 0 0 3px var(--focus-ring)}
.ef-money i{font-style:normal;color:#98A2B3;font-weight:600}
.ef-money .ef-input{border:0;box-shadow:none}
.ef-x{display:grid;place-items:center;border:0;background:transparent;font-size:16px;color:#98A2B3;cursor:pointer;width:32px;height:32px;border-radius:8px}
.ef-x:hover{background:#F2F4F7;color:#475467}
.ef-row small{flex-basis:100%;font-size:13px;font-weight:600}
.ef-save{color:#067647}.ef-warn{color:#B54708}
.ef-link{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:#0F766E;font:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:8px 0}
.ef-btn-ghost{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border:1px solid var(--line);border-radius:13px;background:var(--soft-grad);box-shadow:var(--soft-shadow);font:inherit;font-size:15px;font-weight:700;cursor:pointer;color:var(--ink)}
.ef-btn-ghost:hover{box-shadow:var(--soft-shadow-hover);border-color:var(--hover-line)}
.ef-save-btn{flex:none;display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 18px;border-radius:12px;font:inherit;font-size:15px;font-weight:750;cursor:pointer;border:1px solid var(--line);background:var(--soft-grad);color:var(--muted);box-shadow:var(--soft-shadow)}
.ef-save-btn.dirty{border-color:transparent;background:var(--green-grad);color:#fff;box-shadow:var(--green-glow)}
.ef-save-btn.dirty:hover{filter:brightness(1.05)}
.ef-save-btn:hover{filter:brightness(1.04)}
.ef-save-btn:disabled{opacity:.7}
.ef-preview{position:sticky;top:76px;height:calc(100vh - 92px);min-height:560px;border-radius:18px;overflow:hidden;border:1px solid var(--line);box-shadow:0 8px 24px -12px rgba(16,24,40,.18);background:#f1f1f1}
/* ── Modo oscuro (mismos colores que Figui) ── */
html.cod-dark .ef{--soft-grad:linear-gradient(180deg,#262a32 0%,#20242b 100%);
  --soft-shadow:0 1px 2px rgba(0,0,0,.4),0 3px 8px -3px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04);
  --soft-shadow-hover:0 2px 4px rgba(0,0,0,.45),0 8px 16px -6px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05);
  --line:#2f333a;--ink:#e4e8ef;--muted:#9fa5ae;--page:#10141a;
  --sel-grad:linear-gradient(180deg,#F4F5F7 0%,#D5D9DF 100%);--sel-glow:0 8px 16px -8px rgba(0,0,0,.6),inset 0 1px 0 #fff;--sel-ink:#111827;
  --focus:#9CA3AF;--focus-ring:rgba(156,163,175,.22);--hover-line:#4a505a}
html.cod-dark .ef-head p,html.cod-dark .ef-pill,html.cod-dark .ef-seg button{color:#b4bac4}
html.cod-dark .ef-label{color:#c9ced6}
html.cod-dark .ef-done-pv{background:#12161c;border-color:#2a3039}html.cod-dark .ef-done-pv b{color:#f3f4f6}html.cod-dark .ef-done-pv span{color:#aab2bf}
html.cod-dark .ef-done-bar{background:linear-gradient(90deg,#16a34a 55%,#2a3039 55%)}
html.cod-dark .ef-card{background:#1a1e25;box-shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -12px rgba(0,0,0,.6)}
html.cod-dark .ef-input,html.cod-dark .ef-money{background:#10141a;border-color:#3a3f48;color:#e4e8ef;box-shadow:inset 0 1px 2px rgba(0,0,0,.3)}
html.cod-dark .ef-money .ef-input{background:transparent}
html.cod-dark .ef-input::placeholder{color:#6f7682}
html.cod-dark .ef-move button,html.cod-dark .ef-custom{color:#c9ced6}
html.cod-dark .ef-seg{background:#10141a;box-shadow:inset 0 1px 2px rgba(0,0,0,.5)}
html.cod-dark .ef-seg button.on,html.cod-dark .ef-pill.on{color:var(--sel-ink)}
html.cod-dark .ef-del{background:linear-gradient(180deg,#3d1c24,#33171d);border-color:#5c2630;color:#ff8a80;box-shadow:none}
html.cod-dark .ef-add-ic{background:#262a32;color:#c9ced6}
html.cod-dark .ef-add button:hover,html.cod-dark .ef-btn-ghost:hover{border-color:#4a505a}
html.cod-dark .ef-colors button,html.cod-dark .ef-custom{border-color:#1a1e25;box-shadow:0 0 0 1px #3a3f48,0 4px 10px -4px rgba(0,0,0,.6)}
html.cod-dark .ef-colors button.on{box-shadow:0 0 0 3px #E4E8EF,0 6px 14px -4px rgba(0,0,0,.6)}
html.cod-dark .ef-x{color:#7f8692}
html.cod-dark .ef-x:hover{background:#262a32;color:#c9ced6}
html.cod-dark .ef-save{color:#4ade80}html.cod-dark .ef-warn{color:#fbbf24}
html.cod-dark .ef-hint a{color:#e4e8ef}html.cod-dark .ef-link{color:#5EEAD4}
html.cod-dark html.cod-dark .ef-preview{background:#10141a;box-shadow:0 8px 24px -12px rgba(0,0,0,.6)}
@media (max-width: 900px){
  .ef{grid-template-columns:1fr;padding:12px}
  .ef-preview{position:relative;top:0;height:640px}
}
`;
