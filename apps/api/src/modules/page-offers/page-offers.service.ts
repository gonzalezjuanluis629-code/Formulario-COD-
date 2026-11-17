import { Injectable, Logger } from '@nestjs/common';
import type { Offer } from '@cod/contracts';
import { AdminClientService } from '../../infra/shopify/admin-client.service';
import type { ShopContext } from '../../infra/shopify/shop-context.service';

/**
 * Ofertas por cantidad que la tienda ya muestra EN SU PÁGINA de producto
 * (su propia caja «1 unidad · 2 unidades · 3 unidades» con precios).
 *
 * Si la página las tiene, el formulario cobra esos precios: el comerciante no
 * tiene que repetirlas en el panel. Se leen de la página pública de la tienda
 * desde el servidor (nunca del navegador del cliente, que podría cambiarlas),
 * y se guardan 5 minutos.
 */
@Injectable()
export class PageOffersService {
  private readonly log = new Logger(PageOffersService.name);
  private cache = new Map<string, { at: number; offers: Offer[] }>();
  private static TTL = 5 * 60_000;

  constructor(private admin: AdminClientService) {}

  /** Ofertas de la página del producto (vacío si la página no tiene caja de ofertas). */
  async forProduct(ctx: ShopContext, productGid: string, unitPriceCents: number): Promise<Offer[]> {
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productGid)) return [];
    const key = `${ctx.shopId}:${productGid}`;
    const hit = this.cache.get(key);
    let rows: { qty: number; cents: number }[];
    if (hit && Date.now() - hit.at < PageOffersService.TTL) {
      rows = hit.offers.map((o) => ({ qty: o.minQty, cents: o.bundlePriceCents ?? 0 }));
    } else {
      rows = await this.read(ctx, productGid).catch((e) => {
        this.log.warn(`No se pudo leer la página de ${productGid} en ${ctx.domain}: ${(e as Error).message}`);
        return [];
      });
      if (this.cache.size > 2000) this.cache.clear();
      this.cache.set(key, { at: Date.now(), offers: rows.map((r) => toOffer(r.qty, r.cents)) });
    }
    // Solo cuentan las que rebajan el precio (nunca se cobra más que en Shopify).
    return rows.filter((r) => r.qty > 1 && r.cents > 0 && r.cents < unitPriceCents * r.qty).map((r) => toOffer(r.qty, r.cents));
  }

  private async read(ctx: ShopContext, productGid: string): Promise<{ qty: number; cents: number }[]> {
    const d = await this.admin.graphql<{ product: { handle: string; onlineStoreUrl: string | null } | null }>(
      ctx, `query($id: ID!){ product(id:$id){ handle onlineStoreUrl } }`, { id: productGid },
    );
    if (!d.product) return [];
    const base = process.env.STOREFRONT_BASE_OVERRIDE;
    const url = base
      ? `${base.replace(/\/+$/, '')}/products/${d.product.handle}`
      : d.product.onlineStoreUrl || `https://${ctx.domain}/products/${d.product.handle}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CODForm/1.0)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return parseOfferBox(await res.text());
  }
}

const toOffer = (qty: number, cents: number): Offer => ({
  id: `page-${qty}`, type: 'QUANTITY', minQty: qty, discountBps: 0, discountCents: 0,
  bundlePriceCents: cents, freeShipping: false, label: `${qty} unidades`,
  title: '', subtitle: '', badge: '', preselected: false, productIds: [],
});

/**
 * Busca en el HTML un grupo de opciones (radio) con cantidades y precios:
 *   <label><input type="radio" name="…qty…" value="2"> 2 unidades … RD$2,950 <s>RD$2,998</s></label>
 * Devuelve [{ qty, cents }] del primer grupo con al menos dos cantidades.
 */
export function parseOfferBox(html: string): { qty: number; cents: number }[] {
  const groups = new Map<string, Map<number, number>>();
  for (const m of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)) {
    const inner = m[1] ?? '';
    const input = inner.match(/<input\b[^>]*>/i)?.[0];
    if (!input || !/type\s*=\s*["']?radio/i.test(input)) continue;
    const value = input.match(/\bvalue\s*=\s*["']?(\d{1,2})["'\s>]/i)?.[1];
    const name = input.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
    const qty = Number(value);
    if (!qty || qty > 50) continue;
    // El precio «de antes» (tachado) no cuenta.
    const text = inner
      .replace(/<(s|del|strike)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#36;|&dollar;/g, '$');
    const money = text.match(/(?:RD\s?\$|US\s?\$|DOP|\$|€|£)\s*([0-9][0-9.,]*)/i)?.[1];
    const cents = money ? parseMoney(money) : null;
    if (cents == null) continue;
    const g = groups.get(name) ?? new Map<number, number>();
    if (!g.has(qty)) g.set(qty, cents);
    groups.set(name, g);
  }
  for (const g of groups.values()) {
    if (g.size >= 2 && [...g.keys()].some((q) => q > 1)) {
      return [...g].map(([qty, cents]) => ({ qty, cents })).sort((a, b) => a.qty - b.qty);
    }
  }
  return [];
}

/** «2,950» · «2,950.00» · «2.950,00» · «2950» → centavos. */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[.,]$/, '');
  let n: number;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s) || /^\d+(\.\d{1,2})?$/.test(s)) n = Number(s.replace(/,/g, ''));
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+,\d{1,2}$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else return null;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
