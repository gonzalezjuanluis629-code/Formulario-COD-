import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import * as crypto from 'node:crypto';
import { getCountryProfile, DO_PROVINCES } from '@cod/geo';
import { ShopSettingsSchema } from '@cod/contracts';

const MAX_ATTEMPTS = 6;
/** Pedidos que se crean en Shopify a la vez (Shopify permite ráfagas; el resto espera su turno). */
const CONCURRENCY = Number(process.env.ORDER_CONCURRENCY ?? 6);
/** Si un proceso se cae a mitad, el pedido vuelve a la cola pasado este tiempo. */
const LEASE_MS = 3 * 60_000;

/**
 * Backoff exponencial: 5s → 15s → 45s → 2m → 7m → 20m.
 * Seis intentos cubren una caída de Shopify de ~30 minutos sin perder el pedido.
 */
const backoffMs = (attempt: number) => Math.min(20 * 60_000, 5_000 * 3 ** attempt);

/**
 * Crea en Shopify los pedidos pendientes, varios a la vez. Devuelve cuántos
 * tomó (si llenó el lote, quien llama vuelve a pasar enseguida).
 */
export async function processOutbox(prisma: PrismaClient, log: Logger): Promise<number> {
  // Pedidos «en proceso» de un worker que se cayó: vuelven a la cola.
  await prisma.outboxEvent.updateMany({
    where: { type: 'ORDER_CREATE', status: 'PROCESSING', nextRetryAt: { lt: new Date() } },
    data: { status: 'PENDING' },
  }).catch(() => undefined);

  const events = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING', nextRetryAt: { lte: new Date() }, type: 'ORDER_CREATE' },
    orderBy: { nextRetryAt: 'asc' },
    take: CONCURRENCY * 4,
  });
  if (!events.length) return 0;

  let next = 0;
  const lane = async () => {
    while (next < events.length) {
      const ev = events[next++]!;
      await handle(prisma, log, ev);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, events.length) }, lane));
  return events.length;
}

async function handle(
  prisma: PrismaClient, log: Logger,
  ev: { id: string; attempts: number; payload: unknown },
): Promise<void> {
  // Lock optimista con «alquiler»: si otro worker ya lo cogió, updateMany afecta a 0 filas.
  const locked = await prisma.outboxEvent.updateMany({
    where: { id: ev.id, status: 'PENDING' },
    data: { status: 'PROCESSING', nextRetryAt: new Date(Date.now() + LEASE_MS) },
  });
  if (locked.count === 0) return;

  try {
    await createOrder(prisma, log, (ev.payload as { submissionId: string }).submissionId);
    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: { status: 'DONE', attempts: { increment: 1 } },
    });
  } catch (e) {
    const attempts = ev.attempts + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    const msg = (e as Error).message.slice(0, 500);

    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: {
        status: dead ? 'DEAD' : 'PENDING',
        attempts,
        nextRetryAt: new Date(Date.now() + backoffMs(attempts)),
        lastError: msg,
      },
    });

    if (dead) {
      // No se pierde: queda en el panel como "pedido con error", con botón de reintento.
      await prisma.submission.update({
        where: { id: (ev.payload as { submissionId: string }).submissionId },
        data: { status: 'FAILED', lastError: msg },
      });
      log.error({ outboxId: ev.id, msg }, 'Pedido agotó los reintentos — requiere revisión manual');
    } else {
      log.warn({ outboxId: ev.id, attempts, msg }, 'Reintentando creación de pedido');
    }
  }
}

async function createOrder(prisma: PrismaClient, log: Logger, submissionId: string): Promise<void> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { shop: { include: { shopifyApp: true } } },
  });
  if (!sub) throw new Error(`Submission ${submissionId} no existe`);

  // Idempotencia en el worker también: si ya se creó, no lo duplicamos.
  if (sub.shopifyOrderId) {
    log.info({ submissionId }, 'El pedido ya existía en Shopify; nada que hacer');
    return;
  }

  const shop = sub.shop;
  // La moneda SIEMPRE es la de la tienda en Shopify: si no coincide, Shopify rechaza el pedido.
  const settings = { ...ShopSettingsSchema.parse(shop.settings ?? {}), ...(shop.currency ? { currency: shop.currency } : {}) };
  const profile = getCountryProfile(shop.countryCode);

  const accessToken = decrypt(shop.id, Buffer.from(shop.accessTokenEnc));
  const pii = JSON.parse(decrypt(shop.id, Buffer.from(sub.customerDataEnc!))) as Pii;
  const totals = sub.totals as unknown as Totals;
  type Item = { variantId?: string; qty: number; priceCents?: number; charge?: boolean; title?: string };
  const allItems = sub.items as Item[];
  const items = allItems.filter((i) => !i.charge && i.variantId) as (Item & { variantId: string })[];
  const charges = allItems.filter((i) => i.charge && (i.priceCents ?? 0) > 0);
  const addr = profile.toShopifyAddress(pii.address);

  // «Detalles adicionales» del pedido: lo que llenó el cliente, con el nombre
  // exacto de cada campo del formulario, y el enlace a su ubicación en el mapa.
  const attrs: { key: string; value: string }[] = [];
  const seen = new Map<string, number>();
  const add = (key: string, value: string) => {
    const k = key.trim().slice(0, 120) || 'Dato';
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    attrs.push({ key: n > 1 ? `${k} (${n})` : k, value });
  };
  if (pii.answers?.length) {
    for (const a of pii.answers) add(a.label, a.value);
  } else if (pii.address.district) {
    add('Sector', pii.address.district); // pedidos de antes de guardar las respuestas
  }
  if (sub.latitude && sub.longitude) {
    const lat = Number(sub.latitude), lng = Number(sub.longitude);
    add('Ubicación (mapa)', `https://maps.google.com/?q=${lat},${lng}`);
  }

  const tags = [settings.orderTag];
  if (sub.riskScore >= 50) tags.push('cod-riesgo-alto');
  if (sub.riskFlags.includes('GPS_PROVINCE_MISMATCH')) tags.push('cod-geo-revisar');

  const variables = {
    order: {
      currency: settings.currency,
      email: pii.email ?? undefined,
      phone: pii.phoneE164,
      note: pii.note ?? undefined,
      tags,
      customAttributes: attrs,
      lineItems: items.map((i) => ({
        variantId: i.variantId,
        quantity: i.qty,
        // Sin esto Shopify guarda la línea como «No se requiere envío» (orderCreate
        // no toma el valor de la variante): todo lo del formulario se entrega.
        requiresShipping: true,
        // Extras con precio especial: Shopify cobra exactamente lo que vio el cliente.
        ...(i.priceCents != null
          ? { priceSet: { shopMoney: { amount: (i.priceCents / 100).toFixed(2), currencyCode: settings.currency } } }
          : {}),
      })),
      shippingAddress: {
        firstName: pii.firstName,
        lastName: pii.lastName,
        phone: pii.phoneE164,
        // Sin geocodificación (GPS sin dirección escrita) el mensajero igual
        // recibe algo útil: el enlace al mapa con las coordenadas exactas.
        address1: addr.address1 || (sub.latitude && sub.longitude
          ? `Ubicación GPS: https://maps.google.com/?q=${Number(sub.latitude)},${Number(sub.longitude)}`
          : 'Sin dirección'),
        address2: addr.address2 ?? undefined,
        city: addr.city || 'Sin especificar',
        // Shopify no tiene provincias para RD: guarda el texto tal cual. Se manda el
        // nombre («Santo Domingo»), no el código («DO-32»), para que se lea bien.
        provinceCode: shopifyProvince(addr.provinceCode, addr.countryCode),
        countryCode: addr.countryCode,
        zip: addr.zip ?? undefined,
      },
      shippingLines: [
        {
          title: totals.shippingCents > 0 ? 'Envío' : 'Envío gratis',
          priceSet: {
            shopMoney: {
              amount: (totals.shippingCents / 100).toFixed(2),
              currencyCode: settings.currency,
            },
          },
        },
        // Cargos extra elegidos por el cliente (p. ej. «Envío express»).
        ...charges.map((c) => ({
          title: c.title || 'Cargo extra',
          priceSet: { shopMoney: { amount: ((c.priceCents ?? 0) / 100).toFixed(2), currencyCode: settings.currency } },
        })),
        // COD fee: se muestra como línea aparte para que el desglose sea claro.
        ...(totals.codFeeCents && totals.codFeeCents > 0
          ? [{
              title: settings.codFeeLabel,
              priceSet: {
                shopMoney: {
                  amount: (totals.codFeeCents / 100).toFixed(2),
                  currencyCode: settings.currency,
                },
              },
            }]
          : []),
      ],
      // Descuento (ofertas por cantidad o código): sin esto Shopify calcula un total
      // mayor que lo cobrado y el pedido queda con saldo pendiente descuadrado.
      ...(totals.discountCents > 0
        ? {
            discountCode: {
              itemFixedDiscountCode: {
                code: (totals.appliedDiscount?.code || totals.appliedOffer || 'COD-DESCUENTO').slice(0, 255),
                amountSet: {
                  shopMoney: {
                    amount: (totals.discountCents / 100).toFixed(2),
                    currencyCode: settings.currency,
                  },
                },
              },
            },
          }
        : {}),
      transactions: [
        {
          kind: 'SALE',
          status: 'PENDING', // contra entrega
          gateway: settings.gateway,
          amountSet: {
            shopMoney: {
              amount: (totals.totalCents / 100).toFixed(2),
              currencyCode: settings.currency,
            },
          },
        },
      ],
    },
    options: {
      inventoryBehaviour: 'DECREMENT_IGNORING_POLICY',
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    },
  };

  type OrderCreateBody = {
    data?: { orderCreate: { order: { id: string; name: string } | null; userErrors: { field: string[] | null; message: string }[] } };
    errors?: { message: string; extensions?: { code?: string } }[];
    extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
  };
  // Si llegan muchos pedidos a la vez y Shopify pide esperar (límite de su API),
  // se espera lo justo y se reintenta aquí mismo: el pedido no pierde su turno.
  const send = async (vars: typeof variables): Promise<OrderCreateBody> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(
        `https://${shop.domain}/admin/api/${shop.shopifyApp.apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
          body: JSON.stringify({ query: MUTATION, variables: vars }),
        },
      );
      if (res.status === 429 && attempt < 8) {
        await sleep(Math.max(1000, Number(res.headers.get('Retry-After') ?? 1) * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
      const body = (await res.json()) as OrderCreateBody;
      const throttled = body.errors?.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled && attempt < 8) {
        const t = body.extensions?.cost?.throttleStatus;
        const need = body.extensions?.cost?.requestedQueryCost ?? 10;
        await sleep(t ? Math.max(300, Math.ceil((need - t.currentlyAvailable) / Math.max(1, t.restoreRate)) * 1000) : 1000);
        continue;
      }
      return body;
    }
  };

  const tShopify = Date.now();
  let body = await send(variables);
  const shopifyMs = Date.now() - tShopify;
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));

  // Si Shopify no reconoce la provincia del país, se reintenta sin ella: la
  // provincia ya va como ciudad, y un pedido no se pierde por un código.
  const provinceError = (body.data?.orderCreate.userErrors ?? []).some((e) =>
    /province|zone|provincia/i.test(`${e.field?.join('.') ?? ''} ${e.message}`));
  if (provinceError && variables.order.shippingAddress.provinceCode) {
    log.warn({ submissionId, provinceCode: variables.order.shippingAddress.provinceCode }, 'Shopify rechazó la provincia; reintentando sin ella');
    body = await send({
      ...variables,
      order: { ...variables.order, shippingAddress: { ...variables.order.shippingAddress, provinceCode: undefined } },
    });
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  }

  const ue = body.data?.orderCreate.userErrors ?? [];
  if (ue.length) {
    // Se sube el error tal cual al panel.
    throw new Error(ue.map((e) => `${e.field?.join('.') ?? '-'}: ${e.message}`).join(' | '));
  }

  const order = body.data?.orderCreate.order;
  if (!order) throw new Error('orderCreate no devolvió pedido');

  await prisma.submission.update({
    where: { id: sub.id },
    data: {
      status: 'CONFIRMED',
      shopifyOrderId: order.id,
      shopifyOrderName: order.name,
      confirmedAt: new Date(),
      createAttempts: { increment: 1 },
    },
  });

  // Código de descuento propio del panel: cuenta un uso (para respetar el límite de usos).
  if (totals.appliedDiscount?.source === 'APP' && totals.appliedDiscount.code) {
    await prisma.discount.updateMany({
      where: { shopId: shop.id, code: totals.appliedDiscount.code },
      data: { usageCount: { increment: 1 } },
    }).catch(() => undefined);
  }

  // Evento de conversión server-side (Meta CAPI / TikTok / GA4). Va por el outbox
  // para que un fallo de la API de Meta no afecte a la creación del pedido, y se
  // reintente solo. El eventId = submissionId, compartido con el píxel del navegador.
  await prisma.outboxEvent.create({
    data: {
      shopId: shop.id,
      type: 'CAPI',
      payload: { submissionId: sub.id } as object,
    },
  }).catch(() => undefined);

  // Métrica del embudo: confirmado + ingreso + si trajo ubicación GPS.
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  await prisma.analyticsDaily.upsert({
    where: { shopId_formId_date: { shopId: shop.id, formId: sub.formId, date: day } },
    create: {
      shopId: shop.id, formId: sub.formId, date: day,
      confirmed: 1,
      revenueCents: BigInt(totals.totalCents),
      withGpsLocation: sub.latitude != null ? 1 : 0,
    },
    update: {
      confirmed: { increment: 1 },
      revenueCents: { increment: BigInt(totals.totalCents) },
      withGpsLocation: { increment: sub.latitude != null ? 1 : 0 },
    },
  }).catch(() => undefined);

  // Tiempos: en cola (desde que el cliente pulsó) y lo que tardó Shopify.
  log.info({ order: order.name, shop: shop.domain, queueMs: tShopify - sub.createdAt.getTime(), shopifyMs }, 'Pedido COD creado');
}

/* ── Cripto (misma derivación que la API) ── */
function decrypt(shopId: string, blob: Buffer): string {
  const master = Buffer.from(process.env.MASTER_ENCRYPTION_KEY ?? '', 'base64');
  const key = Buffer.from(
    crypto.hkdfSync('sha256', master, Buffer.from(shopId), Buffer.from('cod-shop-key'), 32),
  );
  const d = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
}

interface Pii {
  /** Respuestas del formulario («Nombre del campo» → valor). */
  answers?: { label: string; value: string }[];
  firstName: string;
  lastName: string;
  phoneE164: string;
  email: string | null;
  note: string | null;
  address: Parameters<ReturnType<typeof getCountryProfile>['toShopifyAddress']>[0];
}
interface Totals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  codFeeCents?: number;
  totalCents: number;
  appliedOffer?: string | null;
  appliedDiscount?: { code: string; source?: 'SHOPIFY' | 'APP' } | null;
}

const MUTATION = /* GraphQL */ `
  mutation CodOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order { id name }
      userErrors { field message }
    }
  }
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** «DO-32» → «Santo Domingo» (RD no tiene provincias en Shopify: se guarda el texto). */
function shopifyProvince(code: string | null | undefined, country: string | null | undefined): string | undefined {
  if (!code) return undefined;
  if ((country ?? 'DO').toUpperCase() !== 'DO') return code;
  return DO_PROVINCES.find((p) => p.code === code.toUpperCase())?.name ?? code;
}
