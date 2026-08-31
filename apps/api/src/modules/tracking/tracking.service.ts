import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { TrackingSettingsSchema } from '@cod/contracts';
import type { ShopContext } from '../../infra/shopify/shop-context.service';

export interface PurchasePayload {
  eventId: string;
  valueCents: number;
  currency: string;
  /** PII en claro (se hashea aquí antes de salir). */
  email: string | null;
  phoneE164: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  /** Para atribución: IP y user-agent del cliente al enviar el formulario. */
  clientIp: string | null;
  clientUserAgent: string | null;
  /** URL de la página donde ocurrió (page de producto). */
  sourceUrl: string | null;
}

/**
 * Tracking server-side. Es lo que hace que las campañas de Meta funcionen.
 *
 * Por qué server-side y no solo el píxel del navegador:
 *   - iOS 14+ y los ad-blockers matan el píxel. Con solo píxel, pierdes
 *     entre el 20% y el 50% de las conversiones. Meta no puede optimizar así.
 *   - El CAPI viaja de servidor a servidor: nadie lo bloquea.
 *   - Compartimos el eventId entre píxel y CAPI → Meta deduplica y no cuenta doble.
 *
 * Meta EXIGE que el email y el teléfono vayan hasheados con SHA-256 (normalizados).
 */
@Injectable()
export class TrackingService {
  private readonly log = new Logger(TrackingService.name);

  /** SHA-256 en minúsculas y sin espacios, como pide Meta. */
  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  async sendPurchase(ctx: ShopContext, p: PurchasePayload): Promise<void> {
    const t = TrackingSettingsSchema.parse((ctx.settings as Record<string, unknown>).tracking ?? {});
    const value = (p.valueCents / 100).toFixed(2);

    await Promise.allSettled([
      this.meta(ctx, t, p, value),
      this.tiktok(ctx, t, p, value),
      this.ga4(ctx, t, p, value),
    ]);
  }

  /* ── Meta Conversions API ── */
  private async meta(
    ctx: ShopContext,
    t: ReturnType<typeof TrackingSettingsSchema.parse>,
    p: PurchasePayload,
    value: string,
  ): Promise<void> {
    if (!t.metaPixelId || !t.metaCapiToken) return;

    const userData: Record<string, unknown> = {};
    if (p.email) userData.em = [this.sha256(p.email)];
    if (p.phoneE164) userData.ph = [this.sha256(p.phoneE164.replace(/\D/g, ''))];
    if (p.firstName) userData.fn = [this.sha256(p.firstName)];
    if (p.lastName) userData.ln = [this.sha256(p.lastName)];
    if (p.city) userData.ct = [this.sha256(p.city)];
    if (p.clientIp) userData.client_ip_address = p.clientIp;
    if (p.clientUserAgent) userData.client_user_agent = p.clientUserAgent;

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: t.purchaseEventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: p.eventId, // ← dedup con el píxel del navegador
          action_source: 'website',
          event_source_url: p.sourceUrl ?? undefined,
          user_data: userData,
          custom_data: { currency: p.currency, value },
        },
      ],
    };
    if (t.metaTestCode) body.test_event_code = t.metaTestCode;

    const url = `https://graph.facebook.com/v21.0/${t.metaPixelId}/events?access_token=${t.metaCapiToken}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      this.log.warn(`Meta CAPI ${res.status} en ${ctx.domain}: ${await res.text()}`);
    } else {
      this.log.log(`Meta Purchase enviado (${ctx.domain}, evento ${p.eventId})`);
    }
  }

  /* ── TikTok Events API ── */
  private async tiktok(
    _ctx: ShopContext,
    t: ReturnType<typeof TrackingSettingsSchema.parse>,
    p: PurchasePayload,
    value: string,
  ): Promise<void> {
    if (!t.tiktokPixelId || !t.tiktokToken) return;

    const body = {
      event_source: 'web',
      event_source_id: t.tiktokPixelId,
      data: [
        {
          event: 'CompletePayment',
          event_id: p.eventId,
          event_time: Math.floor(Date.now() / 1000),
          user: {
            email: p.email ? this.sha256(p.email) : undefined,
            phone: p.phoneE164 ? this.sha256(p.phoneE164) : undefined,
            ip: p.clientIp ?? undefined,
            user_agent: p.clientUserAgent ?? undefined,
          },
          properties: { currency: p.currency, value: Number(value) },
        },
      ],
    };

    await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Access-Token': t.tiktokToken },
      body: JSON.stringify(body),
    }).catch((e) => this.log.warn(`TikTok API: ${(e as Error).message}`));
  }

  /* ── GA4 Measurement Protocol ── */
  private async ga4(
    _ctx: ShopContext,
    t: ReturnType<typeof TrackingSettingsSchema.parse>,
    p: PurchasePayload,
    value: string,
  ): Promise<void> {
    if (!t.ga4MeasurementId || !t.ga4ApiSecret) return;

    const body = {
      client_id: p.eventId,
      events: [
        {
          name: 'purchase',
          params: {
            currency: p.currency,
            value: Number(value),
            transaction_id: p.eventId,
          },
        },
      ],
    };

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${t.ga4MeasurementId}&api_secret=${t.ga4ApiSecret}`;
    await fetch(url, { method: 'POST', body: JSON.stringify(body) })
      .catch((e) => this.log.warn(`GA4 MP: ${(e as Error).message}`));
  }
}
