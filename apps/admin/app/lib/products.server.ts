import { shopifyGraphql, shopToken } from './figui.server';

/** Nombre y precio actual en Shopify de unos productos (primera variante). */
export async function productInfo(
  shop: { id: string; domain: string; accessTokenEnc: Uint8Array },
  admin: { graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response> } | null,
  ids: string[],
): Promise<Map<string, { title: string; priceCents: number | null }>> {
  const out = new Map<string, { title: string; priceCents: number | null }>();
  if (!ids.length) return out;
  const q = 'query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title variants(first: 1) { nodes { price } } } } }';
  type Node = { id?: string; title?: string; variants?: { nodes: { price: string }[] } } | null;
  try {
    let nodes: Node[];
    if (admin) nodes = ((await (await admin.graphql(q, { variables: { ids } })).json()) as { data: { nodes: Node[] } }).data.nodes;
    else nodes = (await shopifyGraphql<{ nodes: Node[] }>(shop.domain, await shopToken(shop.id, shop.accessTokenEnc), q, { ids })).nodes;
    for (const n of nodes) {
      if (!n?.id) continue;
      const price = n.variants?.nodes[0]?.price;
      out.set(n.id, { title: n.title ?? 'Producto', priceCents: price ? Math.round(parseFloat(price) * 100) : null });
    }
  } catch { /* sin precio en vivo: se muestra sin ejemplo */ }
  return out;
}
