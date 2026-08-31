import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import type { SubmitRequest, SubmitResponse } from '@cod/contracts';
import { ShopSettingsSchema } from '@cod/contracts';
import { getCountryProfile, type NormalizedAddress } from '@cod/geo';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import type { ShopContext } from '../../infra/shopify/shop-context.service';
import { QuoteService } from '../quote/quote.service';
import { AntifraudService } from '../antifraud/antifraud.service';
import { AddonsService } from '../addons/addons.service';

/**
 * EL CASO DE USO CRÍTICO.
 *
 * Orden deliberado de los pasos:
 *   1. Idempotencia    → un doble-tap no crea dos pedidos.
 *   2. Rate limit      → un bot no nos tumba la tienda.
 *   3. Validación      → los datos del cliente NO son de fiar.
 *   4. Riesgo          → scoring (incluida la distancia GPS vs. provincia).
 *   5. Recálculo       → el precio SIEMPRE lo pone el servidor.
 *   6. Persistir + Outbox.
 *   7. RESPONDER YA.   ← el cliente ve la confirmación en <400 ms
 *   8. El worker crea el pedido en Shopify, con reintentos.
 *
 * El paso 7 antes del 8 es lo que hace que una caída de Shopify NO nos cueste
 * ventas: el pedido queda en la cola y entra cuando Shopify vuelva.
 */
@Injectable()
export class SubmitService {
  private readonly log = new Logger(SubmitService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private crypto: CryptoService,
    private quote: QuoteService,
    private antifraud: AntifraudService,
    private addons: AddonsService,
  ) {}

  async submit(ctx: ShopContext, dto: SubmitRequest, ip: string, ua: string): Promise<SubmitResponse> {
    const settings = ShopSettingsSchema.parse(ctx.settings ?? {});
    const profile = getCountryProfile(ctx.countryCode);

    /* 1 ─ Idempotencia. Es la misma tecla pulsada dos veces, no dos pedidos. */
    const existing = await this.prisma.submission.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      // Reintento del mismo envío: reconstruimos el nombre desde los fields.
      const name = String(dto.fields.firstName ?? dto.fields.fullName ?? '').split(' ')[0] ?? '';
      const phone = String(dto.fields.phone ?? '');
      const prevTotal = (existing.totals as { totalCents?: number })?.totalCents ?? 0;
      return this.response(existing.id, settings, { name, phone }, prevTotal);
    }

    /* 2 ─ Rate limit por IP y por teléfono. */
    const ipHash = this.crypto.hash(ip);
    if (!(await this.redis.allow(this.redis.key(ctx.shopId, 'rl:ip', ipHash), 10, 600))) {
      throw new ConflictException('Demasiados intentos. Espera unos minutos.');
    }

    /* 3 ─ Honeypot + tiempo mínimo. Un humano no llena esto en 2 segundos. */
    if (dto.hp) throw new BadRequestException('Solicitud rechazada');
    const elapsed = dto.startedAt ? Date.now() - dto.startedAt : Infinity;
    if (elapsed < 2000) throw new BadRequestException('Solicitud rechazada');

    /* 4 ─ Teléfono a E.164. Shopify no acepta otro formato. */
    const rawPhone = String(dto.fields.phone ?? '');
    const phoneE164 = profile.phone.normalize(rawPhone);
    if (!phoneE164) throw new BadRequestException('Número de teléfono no válido');
    const phoneHash = this.crypto.hash(phoneE164);

    /* 5 ─ Blocklist + duplicados + riesgo. */
    await this.antifraud.assertNotBlocked(ctx.shopId, { phoneHash, ipHash });
    const cartHash = this.crypto.hash(`${dto.variantId}:${dto.qty}`);
    await this.antifraud.assertNotDuplicate(ctx.shopId, phoneHash, cartHash);
    await this.antifraud.assertUnderDailyLimit(
      ctx.shopId, phoneHash, settings.antifraud.maxOrdersPerPhonePerDay,
    );

    const risk = await this.antifraud.score({
      shopId: ctx.shopId,
      phoneHash,
      location: dto.location,
      declaredProvince: this.declaredProvince(dto),
    });

    /* 6 ─ Addons aceptados: se validan contra Shopify (precio real). */
    const resolvedAddons = await this.addons.resolve(
      ctx,
      dto.acceptedAddons.map((a: { id: string }) => a.id),
    );

    /* 6b ─ RECÁLCULO. Lo que el cliente diga que cuesta nos da igual. */
    const totals = await this.quote.compute(ctx, {
      formId: dto.formId,
      variantId: dto.variantId,
      qty: dto.qty,
      province: this.declaredProvince(dto),
      discountCode: dto.discountCode ?? null,
      addonIds: dto.acceptedAddons.map((a: { id: string }) => a.id),
    });

    if (dto.clientTotals && dto.clientTotals.totalCents !== totals.totalCents) {
      // No bloquea: el precio bueno es el nuestro. Pero queda marcado.
      risk.flags.push('PRICE_MISMATCH');
      risk.score += 25;
      this.log.warn(
        `Total del cliente (${dto.clientTotals.totalCents}) ≠ servidor (${totals.totalCents}) en ${ctx.domain}`,
      );
    }

    /* 7 ─ PII cifrada. En claro no se guarda nada. */
    const address = this.buildAddress(dto, profile);
    const pii = JSON.stringify({
      firstName: String(dto.fields.firstName ?? dto.fields.fullName ?? '').split(' ')[0] ?? '',
      lastName: this.lastName(dto),
      phoneE164,
      email: (dto.fields.email as string) || null,
      address,
      note: (dto.fields.note as string) || null,
    });

    /* 8 ─ Persistir + (quizá) encolar.
       Si el riesgo supera el umbral y el merchant activó la retención, el pedido
       NO se envía a Shopify todavía: queda HELD para que él lo apruebe a mano.
       El cliente ve su confirmación igual — no sabe que quedó en revisión. */
    const hold =
      settings.antifraud.holdHighRisk && risk.score >= settings.antifraud.riskThreshold;

    const submission = await this.prisma.$transaction(async (tx) => {
      const s = await tx.submission.create({
        data: {
          shopId: ctx.shopId,
          formId: dto.formId,
          formVersionId: dto.formVersionId,
          idempotencyKey: dto.idempotencyKey,
          status: hold ? 'HELD' : 'PENDING',
          customerDataEnc: this.crypto.encrypt(ctx.shopId, pii),
          phoneHash,
          emailHash: dto.fields.email ? this.crypto.hash(String(dto.fields.email)) : null,
          cartHash,
          items: [
            { variantId: dto.variantId, qty: dto.qty },
            ...resolvedAddons.lineItems, // order bumps / upsells como líneas extra
          ],
          appliedOffers: resolvedAddons.accepted as unknown as object,
          totals: totals as unknown as object,
          latitude: dto.location?.lat ?? null,
          longitude: dto.location?.lng ?? null,
          accuracyMeters: dto.location?.accuracyMeters ?? null,
          locationSource: (dto.location?.source ?? 'NONE') as never,
          locationCapturedAt: dto.location ? new Date(dto.location.capturedAt) : null,
          ipHash,
          userAgent: ua.slice(0, 255),
          riskScore: risk.score,
          riskFlags: risk.flags,
          timeToCompleteMs: Number.isFinite(elapsed) ? elapsed : null,
          // Retención de datos protegidos (Protected Customer Data).
          purgeAfter: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
        },
      });

      // Solo se encola si NO está retenido. Al aprobarlo, el admin crea el evento.
      if (!hold) {
        await tx.outboxEvent.create({
          data: {
            shopId: ctx.shopId,
            type: 'ORDER_CREATE',
            payload: { submissionId: s.id } as object,
          },
        });
      }

      return s;
    });

    this.log.log(
      `Submission ${submission.id} ${hold ? 'RETENIDA' : 'aceptada'} (riesgo ${risk.score})`,
    );

    /* 9 ─ Respondemos YA. El pedido en Shopify lo crea el worker. */
    const firstName = String(dto.fields.firstName ?? dto.fields.fullName ?? '').split(' ')[0] ?? '';
    return this.response(submission.id, settings, { name: firstName, phone: phoneE164 }, totals.totalCents);
  }

  private response(
    id: string,
    settings: ReturnType<typeof ShopSettingsSchema.parse>,
    customer: { name: string; phone: string },
    totalCents: number,
  ): SubmitResponse {
    const c = settings.confirmation;
    const t = settings.tracking;

    // El número de pedido aún no existe (lo pone el worker), así que en el
    // mensaje de WhatsApp usamos algo estable. Si el merchant quiere el número
    // real, se resuelve cuando el pedido ya está en Shopify (no en este turno).
    const whatsappUrl =
      c.redirectTarget === 'whatsapp' && c.whatsapp.enabled && c.whatsapp.phone
        ? this.buildWhatsappUrl(c.whatsapp.phone, c.whatsapp.messageTemplate, customer)
        : null;

    // eventId estable = submissionId. El píxel del navegador y el CAPI usan el
    // mismo, así Meta deduplica y no cuenta la compra dos veces.
    const hasPixel = !!(t.metaPixelId || t.tiktokPixelId);

    return {
      ok: true,
      submissionId: id,
      title: c.title,
      message: c.message,
      redirectTarget: c.redirectTarget,
      redirectUrl: settings.thankYouUrl, // configurable desde el panel, nunca fija
      whatsappUrl,
      redirectDelayMs: settings.redirectDelayMs,
      purchasePixel: hasPixel
        ? {
            eventId: id,
            valueCents: totalCents,
            currency: settings.currency,
            metaPixelId: t.metaPixelId || null,
            tiktokPixelId: t.tiktokPixelId || null,
            eventName: t.purchaseEventName,
          }
        : null,
    };
  }

  /** Sustituye {nombre} {telefono} {pedido} {total} y arma la URL wa.me. */
  private buildWhatsappUrl(
    phone: string,
    template: string,
    customer: { name: string; phone: string },
  ): string {
    const msg = template
      .replace(/\{nombre\}/g, customer.name)
      .replace(/\{telefono\}/g, customer.phone)
      .replace(/\{pedido\}/g, '') // el número real no existe todavía
      .replace(/\{total\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const digits = phone.replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  }

  private declaredProvince(dto: SubmitRequest): string | null {
    return (dto.fields.province as string) || (dto.fields.provinceCode as string) || null;
  }

  private lastName(dto: SubmitRequest): string {
    if (dto.fields.lastName) return String(dto.fields.lastName);
    const full = String(dto.fields.fullName ?? '').trim().split(/\s+/);
    return full.length > 1 ? full.slice(1).join(' ') : '.'; // Shopify no acepta apellido vacío
  }

  private buildAddress(dto: SubmitRequest, profile: ReturnType<typeof getCountryProfile>): NormalizedAddress {
    const f = dto.fields;
    return {
      formatted: (f.address as string) || null,
      street: (f.street as string) || (f.address as string) || null,
      number: (f.number as string) || null,
      district: (f.sector as string) || null,
      city: (f.city as string) || (f.municipality as string) || null,
      province: (f.province as string) || null,
      provinceCode: profile.matchProvince((f.provinceCode as string) || (f.province as string)),
      postalCode: (f.postalCode as string) || null,
      country: profile.code,
    };
  }
}
