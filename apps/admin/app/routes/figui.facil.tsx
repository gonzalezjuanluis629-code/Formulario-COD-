import { useEffect, useMemo, useState } from 'react';
import { Banner, Frame, Toast } from '@shopify/polaris';
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

/**
 * EDITOR FÁCIL (Figui). Tres pasos en una pantalla y un solo botón «Guardar»:
 *   1. Los datos que se piden al cliente (nombre, obligatorio, mostrar, orden).
 *   2. Los botones (textos y color).
 *   3. Precios por cantidad de cada producto («si lleva 2 → RD$ 2,950»).
 * Lo demás sigue en «Opciones avanzadas».
 */

type PriceRow = { qty: string; price: string };
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
  });
  if (!form) throw redirect('/figui?lista=1');
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

  return {
    formId: form.id,
    fields: ((version?.schema as Field[] | undefined) ?? []).slice().sort((a, b) => a.order - b.order),
    tokens: ThemeTokensSchema.parse(theme.tokens ?? {}),
    products,
    advancedOffers: offers.filter((x) => x.active && !isSimple(x.o)).length,
    shipping: { defaultShippingCents: st.defaultShippingCents, freeShippingOverCents: st.freeShippingOverCents, codFeeCents: st.codFeeCents },
  };
}

type Result = { ok: boolean; message: string };

export async function action({ request }: ActionFunctionArgs): Promise<Result> {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const body = JSON.parse(String(fd.get('data') || '{}')) as {
    fields: Field[];
    buttons: { trigger: string; triggerSub: string; submit: string; color: string; showPrice: boolean };
    products: ProductPrices[];
  };
  const form = await db.form.findFirst({ where: { shopId: shop.id, status: { not: 'ARCHIVED' } }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] });
  if (!form) return { ok: false, message: 'No se encontró el formulario.' };

  // 1) Datos que se piden → versión nueva publicada (se puede volver atrás en avanzadas).
  const parsed = FieldSchema.array().safeParse(body.fields.map((f, i) => ({ ...f, order: i + 1 })));
  if (!parsed.success) return { ok: false, message: 'Hay un dato del formulario sin nombre o con algo raro. Revísalo.' };
  if (parsed.data.some((f) => !['heading', 'subheading', 'divider', 'richtext', 'html', 'image', 'video'].includes(f.type) && !(f.label || f.content).trim())) {
    return { ok: false, message: 'Hay un dato sin nombre. Escríbele un nombre (por ejemplo «Teléfono»).' };
  }
  const last = await db.formVersion.findFirst({ where: { formId: form.id }, orderBy: { version: 'desc' } });
  const version = await db.formVersion.create({
    data: { formId: form.id, version: (last?.version ?? 0) + 1, schema: parsed.data as object, publishedAt: new Date() },
  });
  await db.form.update({ where: { id: form.id }, data: { currentVersionId: version.id, status: 'ACTIVE' } });

  // 2) Botones.
  const theme = await themeFor(shop.id, form.themeId);
  const t = ThemeTokensSchema.parse(theme.tokens ?? {});
  const color = /^#[0-9a-f]{6}$/i.test(body.buttons.color) ? body.buttons.color : t.submit.bg;
  const descriptions = [body.buttons.triggerSub.trim(), ...t.trigger.descriptions.slice(1)].filter(Boolean).slice(0, 5);
  const tokens = ThemeTokensSchema.parse({
    ...t,
    trigger: { ...t.trigger, text: body.buttons.trigger.trim() || 'Comprar ahora', descriptions, bg: color, bgType: 'solid' },
    submit: { ...t.submit, text: body.buttons.submit.trim() || 'Finalizar pedido', bg: color, bgType: 'solid', priceDisplay: body.buttons.showPrice ? 'total' : 'none' },
  });
  await db.theme.update({ where: { id: theme.id }, data: { tokens: tokens as object } });
  if (form.themeId !== theme.id) await db.form.update({ where: { id: form.id }, data: { themeId: theme.id } });

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

  return { ok: true, message: '¡Guardado! Ya está en tu tienda (puede tardar 1 minuto).' };
}

/* ─────────────────────────── Pantalla ─────────────────────────── */

const ADD: { label: string; icon: string; make: (order: number) => Field }[] = [
  { label: 'Nombre', icon: '👤', make: (o) => ({ ...newField('text', o), label: 'Nombre completo', placeholder: 'Tu nombre completo', required: true }) },
  { label: 'Teléfono / WhatsApp', icon: '📱', make: (o) => ({ ...newField('phone', o), label: 'WhatsApp', placeholder: '809 000 0000', required: true }) },
  { label: 'Correo', icon: '✉️', make: (o) => ({ ...newField('email', o), label: 'Correo', placeholder: 'tucorreo@ejemplo.com' }) },
  { label: 'Dirección', icon: '🏠', make: (o) => ({ ...newField('textarea', o), label: 'Dirección', placeholder: 'Calle, número, sector…', required: true }) },
  { label: 'Ciudad', icon: '🏙️', make: (o) => ({ ...newField('text', o), label: 'Ciudad', placeholder: 'Tu ciudad' }) },
  { label: 'Nota', icon: '📝', make: (o) => ({ ...newField('textarea', o), label: 'Nota para el pedido', placeholder: 'Algo que debamos saber' }) },
  { label: 'Casilla «Acepto»', icon: '☑️', make: (o) => ({ ...newField('checkbox', o), label: '', content: 'Confirmo que recibiré mi pedido.', required: true }) },
  { label: 'Pregunta con opciones', icon: '🔘', make: (o) => ({ ...newField('radio', o), label: '¿Qué prefieres?', options: [{ label: 'Opción 1', value: 'opcion-1' }, { label: 'Opción 2', value: 'opcion-2' }] }) },
];

const KIND: Partial<Record<Field['type'], string>> = {
  text: 'Texto', textarea: 'Texto largo', email: 'Correo', phone: 'Teléfono', number: 'Número', date: 'Fecha',
  select: 'Lista', radio: 'Opciones', multiselect: 'Varias opciones', checkbox: 'Casilla', location: 'Ubicación (GPS o escrita)',
  discount: 'Código de descuento', heading: 'Título', subheading: 'Subtítulo', richtext: 'Texto', divider: 'Separador',
};

const COLORS = ['#111111', '#16a34a', '#2563eb', '#dc2626', '#ea580c', '#7c3aed', '#db2777', '#0f766e'];

export default function EditorFacil() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<Result>();
  const [fields, setFields] = useState<Field[]>(data.fields);
  const [trigger, setTrigger] = useState(data.tokens.trigger.text);
  const [triggerSub, setTriggerSub] = useState(data.tokens.trigger.descriptions[0] ?? '');
  const [submitText, setSubmitText] = useState(data.tokens.submit.text);
  const [color, setColor] = useState(data.tokens.submit.bg);
  const [showPrice, setShowPrice] = useState(data.tokens.submit.priceDisplay !== 'none');
  const [products, setProducts] = useState<ProductPrices[]>(data.products);
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
  const add = (make: (o: number) => Field) => { setFields((l) => [...l, make(l.length + 1)]); touch(); };

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
    { data: JSON.stringify({ fields, buttons: { trigger, triggerSub, submit: submitText, color, showPrice }, products }) },
    { method: 'post' },
  );

  // Vista previa con lo que se está editando ahora mismo.
  const pvTokens = useMemo<ThemeTokens>(() => ({
    ...data.tokens,
    trigger: { ...data.tokens.trigger, text: trigger, descriptions: [triggerSub, ...data.tokens.trigger.descriptions.slice(1)].filter(Boolean), bg: color, bgType: 'solid' },
    submit: { ...data.tokens.submit, text: submitText, bg: color, bgType: 'solid', priceDisplay: showPrice ? 'total' : 'none' },
  }), [data.tokens, trigger, triggerSub, submitText, color, showPrice]);
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
          </header>
          {fetcher.data && !fetcher.data.ok && !busy && <Banner tone="critical">{fetcher.data.message}</Banner>}

          {/* 1 ─ Datos */}
          <section className="ef-card">
            <h2><span className="ef-n">1</span> ¿Qué datos le pides al cliente?</h2>
            <p className="ef-hint">Escribe cómo se llama cada dato. Usa las flechas para cambiar el orden.</p>
            <ul className="ef-fields">
              {fields.map((f, i) => {
                const isCheck = f.type === 'checkbox';
                const name = isCheck ? f.content : f.label;
                const auto = f.type === 'location' || (f.type === 'select' && f.options.length > 12) || f.conditions.length > 0;
                return (
                  <li key={f.key} className={`ef-field${f.visible ? '' : ' off'}`}>
                    <div className="ef-move">
                      <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                      <button type="button" aria-label="Bajar" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>▼</button>
                    </div>
                    <div className="ef-main">
                      <span className="ef-kind">{KIND[f.type] ?? f.type}{auto && f.conditions.length ? ' · sale si escribe la dirección' : ''}</span>
                      <input className="ef-input" value={name} aria-label="Nombre del dato"
                        placeholder={isCheck ? 'Texto de la casilla' : 'Nombre del dato'}
                        onChange={(e) => setField(i, isCheck ? { content: e.target.value } : { label: e.target.value })} />
                      {(f.type === 'radio' || f.type === 'multiselect' || (f.type === 'select' && f.options.length <= 12)) && (
                        <textarea className="ef-input ef-opts" rows={Math.max(2, f.options.length)} aria-label="Opciones"
                          value={f.options.map((o) => o.label).join('\n')}
                          onChange={(e) => setField(i, { options: e.target.value.split('\n').map((l, k) => ({ label: l, value: l.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || `opcion-${k + 1}` })) })} />
                      )}
                      <div className="ef-toggles">
                        <label className={`ef-pill${f.required ? ' on' : ''}`}>
                          <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                          {f.required ? '✓ Obligatorio' : 'Opcional'}
                        </label>
                        <label className={`ef-pill${f.visible ? ' on' : ''}`}>
                          <input type="checkbox" checked={f.visible} onChange={(e) => setField(i, { visible: e.target.checked })} />
                          {f.visible ? '👁 Se ve' : '🚫 Oculto'}
                        </label>
                      </div>
                    </div>
                    <button type="button" className="ef-del" aria-label={`Quitar ${name}`} onClick={() => remove(i)}>🗑</button>
                  </li>
                );
              })}
            </ul>
            <p className="ef-sub">➕ Añadir un dato</p>
            <div className="ef-add">
              {ADD.map((a) => (
                <button type="button" key={a.label} onClick={() => add(a.make)}><span>{a.icon}</span>{a.label}</button>
              ))}
            </div>
          </section>

          {/* 2 ─ Botones */}
          <section className="ef-card">
            <h2><span className="ef-n">2</span> Los botones</h2>
            <label className="ef-label">Botón para abrir el formulario
              <input className="ef-input" value={trigger} onChange={(e) => { setTrigger(e.target.value); touch(); }} placeholder="Comprar ahora" />
            </label>
            <label className="ef-label">Frase pequeña debajo (opcional)
              <input className="ef-input" value={triggerSub} onChange={(e) => { setTriggerSub(e.target.value); touch(); }} placeholder="Pagas al recibir" />
            </label>
            <label className="ef-label">Botón para confirmar el pedido
              <input className="ef-input" value={submitText} onChange={(e) => { setSubmitText(e.target.value); touch(); }} placeholder="Finalizar pedido" />
            </label>
            <span className="ef-label">Color de los botones</span>
            <div className="ef-colors" role="radiogroup" aria-label="Color de los botones">
              {COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={color.toLowerCase() === c} aria-label={c}
                  className={color.toLowerCase() === c ? 'on' : ''} style={{ background: c }} onClick={() => { setColor(c); touch(); }} />
              ))}
              <label className="ef-custom" title="Otro color">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#111111'} onChange={(e) => { setColor(e.target.value); touch(); }} />🎨
              </label>
            </div>
            <label className={`ef-pill big${showPrice ? ' on' : ''}`}>
              <input type="checkbox" checked={showPrice} onChange={(e) => { setShowPrice(e.target.checked); touch(); }} />
              {showPrice ? '✓ Mostrar el total en el botón de confirmar' : 'Mostrar el total en el botón de confirmar'}
            </label>
          </section>

          {/* 3 ─ Precios */}
          <section className="ef-card">
            <h2><span className="ef-n">3</span> Precios por cantidad</h2>
            <p className="ef-hint">Pon cuánto cobras en total si el cliente lleva 2, 3… unidades. Si tu página de producto ya tiene su caja de ofertas, se usan esos precios y aquí no tienes que poner nada.</p>
            {products.map((p, pi) => (
              <div key={p.id} className="ef-prod">
                <div className="ef-prod-head">
                  <div><b>{p.title}</b>{p.priceCents != null && <small>Precio normal: {money(p.priceCents)} c/u</small>}</div>
                  <button type="button" className="ef-del" aria-label={`Quitar precios de ${p.title}`}
                    onClick={() => { setProducts((l) => l.filter((_, i) => i !== pi)); touch(); }}>🗑</button>
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
                        onClick={() => { setProducts((l) => l.map((x, i) => (i !== pi ? x : { ...x, rows: x.rows.filter((_, j) => j !== ri) }))); touch(); }}>✕</button>
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
                }}>➕ Añadir otra cantidad</button>
              </div>
            ))}
            <button type="button" className="ef-btn-ghost" onClick={() => void addProduct()}>🛍️ Poner precios a un producto</button>
            {data.advancedOffers > 0 && (
              <p className="ef-hint">Tienes {data.advancedOffers} oferta(s) avanzada(s) (porcentaje, varios productos…). Siguen igual; se cambian en <Link to="/figui/offers">Ofertas y descuentos</Link>.</p>
            )}
          </section>

          <p className="ef-adv">¿Necesitas algo más? <Link to="/figui?lista=1">Opciones avanzadas</Link></p>
          <div className="ef-save-bar">
            <button type="button" className="ef-save-btn" disabled={busy} onClick={save}>
              {busy ? 'Guardando…' : dirty ? '💾 Guardar cambios' : '✓ Todo guardado'}
            </button>
          </div>
        </div>

        <div className="ef-preview">
          <Preview fields={fields} tokens={pvTokens} offers={pvOffers} unitPriceCents={pvProduct?.priceCents ?? 0}
            shipping={data.shipping} showTrigger focus={null}
            hint={pvProduct ? `Precios de «${pvProduct.title}».` : 'Así lo ve tu cliente.'} />
        </div>
      </div>
      {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
    </Frame>
  );
}

const CSS = `
.ef{display:grid;grid-template-columns:minmax(0,560px) minmax(0,1fr);gap:18px;align-items:start;padding:16px;max-width:1240px;margin:0 auto;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a1a}
.ef-side{display:flex;flex-direction:column;gap:14px;min-width:0;padding-bottom:90px}
.ef-head h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-.01em}
.ef-head p{margin:6px 0 0;color:#555;font-size:15px;line-height:1.45}
.ef-card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 0 rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.06)}
.ef-card h2{display:flex;align-items:center;gap:10px;margin:0 0 6px;font-size:19px;font-weight:800}
.ef-n{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#111;color:#fff;font-size:15px;flex:none}
.ef-hint{margin:0 0 12px;color:#666;font-size:14px;line-height:1.45}
.ef-hint a,.ef-adv a{color:#2563eb;font-weight:600}
.ef-fields{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.ef-field{display:flex;gap:10px;align-items:flex-start;border:1.5px solid #e6e6e6;border-radius:14px;padding:10px;background:#fcfcfc}
.ef-field.off{opacity:.55}
.ef-move{display:flex;flex-direction:column;gap:4px}
.ef-move button{width:36px;height:30px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:12px;cursor:pointer;color:#333}
.ef-move button:disabled{opacity:.3;cursor:default}
.ef-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.ef-kind{font-size:12px;font-weight:700;color:#777;text-transform:uppercase;letter-spacing:.04em}
.ef-input{width:100%;box-sizing:border-box;border:1.5px solid #d9d9d9;border-radius:10px;padding:11px 12px;font:inherit;font-size:16px;background:#fff;color:#111;outline:none}
.ef-input:focus{border-color:#111;box-shadow:0 0 0 3px rgba(0,0,0,.07)}
.ef-opts{resize:vertical;font-size:15px;line-height:1.5}
.ef-toggles{display:flex;gap:8px;flex-wrap:wrap}
.ef-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:99px;border:1.5px solid #d9d9d9;background:#fff;font-size:14px;font-weight:600;cursor:pointer;user-select:none;color:#444}
.ef-pill input{position:absolute;opacity:0;pointer-events:none}
.ef-pill.on{background:#111;border-color:#111;color:#fff}
.ef-pill.big{margin-top:12px;padding:12px 16px;font-size:15px}
.ef-del{border:0;background:#fff1f1;width:40px;height:40px;border-radius:10px;font-size:18px;cursor:pointer;flex:none}
.ef-sub{margin:16px 0 8px;font-weight:800;font-size:15px}
.ef-add{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ef-add button{display:flex;align-items:center;gap:8px;padding:13px 12px;border:1.5px dashed #c9c9c9;border-radius:12px;background:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-align:left;color:#222}
.ef-add button:hover{border-color:#111;background:#fafafa}
.ef-add button span{font-size:20px}
.ef-label{display:flex;flex-direction:column;gap:6px;margin:10px 0 0;font-size:14px;font-weight:700;color:#333}
.ef-colors{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.ef-colors button,.ef-custom{width:42px;height:42px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1.5px #d4d4d4;cursor:pointer}
.ef-colors button.on{box-shadow:0 0 0 3px #111}
.ef-custom{display:grid;place-items:center;background:#f4f4f4;font-size:18px;position:relative;overflow:hidden}
.ef-custom input{position:absolute;inset:0;opacity:0;cursor:pointer}
.ef-prod{border:1.5px solid #e6e6e6;border-radius:14px;padding:12px;margin-bottom:10px;background:#fcfcfc}
.ef-prod-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}
.ef-prod-head b{display:block;font-size:16px}
.ef-prod-head small{display:block;color:#666;font-size:13px;margin-top:2px}
.ef-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0;border-top:1px dashed #e3e3e3;font-size:15px;font-weight:600}
.ef-qty{width:64px!important;text-align:center}
.ef-money{display:flex;align-items:center;border:1.5px solid #d9d9d9;border-radius:10px;background:#fff;padding-left:10px;flex:1;min-width:120px}
.ef-money i{font-style:normal;color:#777}
.ef-money .ef-input{border:0;box-shadow:none}
.ef-x{border:0;background:transparent;font-size:16px;color:#999;cursor:pointer;width:32px;height:32px}
.ef-row small{flex-basis:100%;font-size:13px;font-weight:600}
.ef-save{color:#15803d}.ef-warn{color:#b45309}
.ef-link{border:0;background:transparent;color:#2563eb;font:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:8px 0}
.ef-btn-ghost{width:100%;padding:14px;border:1.5px dashed #bdbdbd;border-radius:12px;background:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.ef-adv{margin:0;text-align:center;color:#666;font-size:14px}
.ef-save-bar{position:sticky;bottom:0;padding:12px 0;background:linear-gradient(transparent,#f1f1f1 35%);z-index:5}
.ef-save-btn{width:100%;padding:17px;border:0;border-radius:14px;background:#16a34a;color:#fff;font:inherit;font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 8px 20px rgba(22,163,74,.25)}
.ef-save-btn:disabled{opacity:.7}
.ef-preview{position:sticky;top:60px;height:calc(100vh - 80px);min-height:560px;border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.06);background:#f1f1f1}
@media (max-width: 900px){
  .ef{grid-template-columns:1fr;padding:12px}
  .ef-preview{position:relative;top:0;height:640px;order:-1}
}
@media (max-width: 900px){ .ef-preview{order:1} }
`;
