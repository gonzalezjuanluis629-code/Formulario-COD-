import { Injectable, Logger } from '@nestjs/common';
import type { ShopContext } from './shop-context.service';

export class ShopifyUserError extends Error {
  constructor(message: string, readonly fields: string[] = []) { super(message); }
}

/**
 * Único punto de contacto con la Admin API. Si Shopify cambia algo,
 * se cambia AQUÍ y en ningún otro sitio (Dependency Inversion).
 *
 * Respeta el leaky bucket de Shopify: si el coste consumido se acerca al
 * límite, espera antes de seguir en vez de comerse un 429.
 */
@Injectable()
export class AdminClientService {
  private readonly log = new Logger(AdminClientService.name);
  private readonly memo = new Map<string, { at: number; p: Promise<unknown> }>();

  /**
   * Lecturas que se repiten mucho (precio de una variante, datos del producto):
   * se guardan unos segundos en memoria. Abrir el formulario y cotizar no
   * esperan a Shopify cada vez. Las peticiones iguales simultáneas comparten
   * una sola llamada.
   */
  cachedGraphql<T>(ctx: ShopContext, query: string, variables: Record<string, unknown> = {}, ttlMs = 30_000): Promise<T> {
    const key = `${ctx.shopId}|${query}|${JSON.stringify(variables)}`;
    const hit = this.memo.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
    if (this.memo.size > 5000) this.memo.clear();
    const p = this.graphql<T>(ctx, query, variables);
    this.memo.set(key, { at: Date.now(), p });
    p.catch(() => { if (this.memo.get(key)?.p === p) this.memo.delete(key); });
    return p;
  }

  async graphql<T>(ctx: ShopContext, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const url = `https://${ctx.domain}/admin/api/${ctx.apiVersion}/graphql.json`;

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': ctx.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After') ?? 2) * 1000;
        this.log.warn(`429 de Shopify; esperando ${wait} ms`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500) {
        await sleep(2 ** attempt * 500);
        continue;
      }
      if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);

      const body = (await res.json()) as {
        data?: T;
        errors?: { message: string }[];
        extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
      };

      if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));

      // Freno preventivo: si queda poco presupuesto, dejamos que el bucket se rellene.
      const t = body.extensions?.cost?.throttleStatus;
      if (t && t.currentlyAvailable < 100) {
        await sleep(Math.ceil((100 - t.currentlyAvailable) / t.restoreRate) * 1000);
      }

      return body.data as T;
    }
    throw new Error('Shopify no respondió tras varios reintentos');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
