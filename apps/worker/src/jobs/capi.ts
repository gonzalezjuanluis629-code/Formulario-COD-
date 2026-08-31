import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import * as crypto from 'node:crypto';

/**
 * Despacha los eventos de conversión (Meta CAPI / TikTok / GA4) que el
 * order-create dejó en el outbox tras confirmar el pedido.
 *
 * Va por el outbox (no inline) para que un fallo de Meta no afecte la creación
 * del pedido, y se reintente solo con backoff. 3 intentos bastan: si Meta está
 * caído más que eso, el píxel del navegador ya cubrió el evento.
 */
const MAX = 3;
const backoff = (n: number) => Math.min(10 * 60_000, 30_000 * 2 ** n);

export async function processCapiOutbox(prisma: PrismaClient, log: Logger): Promise<void> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING', nextRetryAt: { lte: new Date() }, type: 'CAPI' },
    orderBy: { nextRetryAt: 'asc' },
    take: 10,
  });
  if (!events.length) return;

  for (const ev of events) {
    const locked = await prisma.outboxEvent.updateMany({
      where: { id: ev.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (locked.count === 0) continue;

    try {
      await dispatch(prisma, log, (ev.payload as { submissionId: string }).submissionId);
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: { status: 'DONE', attempts: { increment: 1 } },
      });
    } catch (e) {
      const attempts = ev.attempts + 1;
      const dead = attempts >= MAX;
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: {
          status: dead ? 'DEAD' : 'PENDING',
          attempts,
          nextRetryAt: new Date(Date.now() + backoff(attempts)),
          lastError: (e as Error).message.slice(0, 500),
        },
      });
      log[dead ? 'error' : 'warn']({ outboxId: ev.id }, `CAPI ${dead ? 'agotado' : 'reintento'}`);
    }
  }
}

async function dispatch(prisma: PrismaClient, log: Logger, submissionId: string): Promise<void> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { shop: true },
  });
  if (!sub || !sub.customerDataEnc) return;

  const settings = (sub.shop.settings ?? {}) as { tracking?: TrackingConfig };
  const t = settings.tracking;
  if (!t) return;

  const pii = JSON.parse(decrypt(sub.shop.id, Buffer.from(sub.customerDataEnc))) as Pii;
  const totals = sub.totals as { totalCents: number };
  const value = (totals.totalCents / 100).toFixed(2);

  const sends: Promise<unknown>[] = [];

  /* ── Meta CAPI ── */
  if (t.metaPixelId && t.metaCapiToken) {
    const userData: Record<string, unknown> = {};
    if (pii.email) userData.em = [sha256(pii.email)];
    if (pii.phoneE164) userData.ph = [sha256(pii.phoneE164.replace(/\D/g, ''))];
    if (pii.firstName) userData.fn = [sha256(pii.firstName)];
    if (pii.lastName) userData.ln = [sha256(pii.lastName)];

    const body: Record<string, unknown> = {
      data: [{
        event_name: t.purchaseEventName || 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: sub.id, // dedup con el píxel del navegador
        action_source: 'website',
        user_data: userData,
        custom_data: { currency: sub.shop.currency, value },
      }],
    };
    if (t.metaTestCode) body.test_event_code = t.metaTestCode;

    sends.push(
      fetch(`https://graph.facebook.com/v21.0/${t.metaPixelId}/events?access_token=${t.metaCapiToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`Meta ${r.status}: ${await r.text()}`);
        log.info({ shop: sub.shop.domain }, 'Meta Purchase enviado (CAPI)');
      }),
    );
  }

  /* ── TikTok ── */
  if (t.tiktokPixelId && t.tiktokToken) {
    sends.push(
      fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Access-Token': t.tiktokToken },
        body: JSON.stringify({
          event_source: 'web',
          event_source_id: t.tiktokPixelId,
          data: [{
            event: 'CompletePayment',
            event_id: sub.id,
            event_time: Math.floor(Date.now() / 1000),
            user: {
              email: pii.email ? sha256(pii.email) : undefined,
              phone: pii.phoneE164 ? sha256(pii.phoneE164) : undefined,
            },
            properties: { currency: sub.shop.currency, value: Number(value) },
          }],
        }),
      }).then(() => undefined),
    );
  }

  /* ── GA4 ── */
  if (t.ga4MeasurementId && t.ga4ApiSecret) {
    sends.push(
      fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${t.ga4MeasurementId}&api_secret=${t.ga4ApiSecret}`, {
        method: 'POST',
        body: JSON.stringify({
          client_id: sub.id,
          events: [{ name: 'purchase', params: { currency: sub.shop.currency, value: Number(value), transaction_id: sub.id } }],
        }),
      }).then(() => undefined),
    );
  }

  // Si alguno de los canales configurados falla, se reintenta el evento entero.
  const results = await Promise.allSettled(sends);
  const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) throw failed.reason;
}

function sha256(v: string): string {
  return crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex');
}

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
  firstName: string;
  lastName: string;
  phoneE164: string;
  email: string | null;
}
interface TrackingConfig {
  metaPixelId?: string;
  metaCapiToken?: string;
  metaTestCode?: string;
  tiktokPixelId?: string;
  tiktokToken?: string;
  ga4MeasurementId?: string;
  ga4ApiSecret?: string;
  purchaseEventName?: string;
}
