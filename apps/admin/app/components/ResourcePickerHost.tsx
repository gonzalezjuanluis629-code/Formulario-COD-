import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, TextField, ResourceList, ResourceItem, Thumbnail, Text, BlockStack, Spinner, InlineStack, Banner } from '@shopify/polaris';
import { ImageIcon } from '@shopify/polaris-icons';
import type { PickedResource } from '../lib/base';

type Item = { id: string; title: string; image: string; variants: { id: string; title: string; price: string }[] };
type Request = { type: 'product' | 'collection'; resolve: (r: PickedResource[] | undefined) => void };

/**
 * Selector de productos y colecciones para el editor abierto desde Figui
 * (fuera de Shopify no existe el selector de App Bridge). Busca en la tienda a
 * través del servidor del formulario.
 */
export function ResourcePickerHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const w = window as unknown as { __codPicker?: (o: { type: 'product' | 'collection' }) => Promise<PickedResource[] | undefined> };
    w.__codPicker = (o) => new Promise((resolve) => { setQ(''); setItems([]); setError(''); setReq({ type: o.type, resolve }); });
    return () => { delete w.__codPicker; };
  }, []);

  const load = useCallback(async (type: 'product' | 'collection', query: string) => {
    const n = ++seq.current;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/figui-api/resources?type=${type}&q=${encodeURIComponent(query)}`);
      const body = (await res.json()) as { items?: Item[]; error?: string };
      if (n !== seq.current) return;
      if (!res.ok) { setError(body.error ?? 'No se pudieron cargar.'); setItems([]); }
      else setItems(body.items ?? []);
    } catch {
      if (n === seq.current) setError('No se pudieron cargar. Revisa tu conexión.');
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!req) return;
    const t = setTimeout(() => void load(req.type, q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [req, q, load]);

  const close = (picked?: Item) => {
    if (!req) return;
    req.resolve(picked ? [{
      id: picked.id, title: picked.title,
      images: picked.image ? [{ url: picked.image }] : [],
      variants: picked.variants.map((v) => ({ id: v.id, title: v.title, price: v.price })),
    }] : undefined);
    setReq(null);
  };

  const noun = req?.type === 'collection' ? 'colección' : 'producto';

  return (
    <Modal open={!!req} onClose={() => close()} title={`Elegir ${noun}`} secondaryActions={[{ content: 'Cancelar', onAction: () => close() }]}>
      <Modal.Section>
        <BlockStack gap="300">
          <TextField label={`Buscar ${noun}`} labelHidden placeholder={`Buscar ${noun}…`} value={q} onChange={setQ} autoComplete="off" clearButton onClearButtonClick={() => setQ('')} />
          {error && <Banner tone="critical">{error}</Banner>}
          {loading && !items.length ? (
            <InlineStack align="center"><Spinner size="small" accessibilityLabel="Cargando" /></InlineStack>
          ) : !items.length && !error ? (
            <Text as="p" tone="subdued">{q ? 'Nada coincide con la búsqueda.' : `La tienda no tiene ${noun === 'producto' ? 'productos' : 'colecciones'}.`}</Text>
          ) : (
            <ResourceList
              items={items}
              renderItem={(it) => (
                <ResourceItem id={it.id} onClick={() => close(it)} accessibilityLabel={`Elegir ${it.title}`}
                  media={<Thumbnail size="small" alt={it.title} source={it.image || ImageIcon} />}>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">{it.title}</Text>
                  {it.variants[0]?.price && <Text as="p" tone="subdued">{Number(it.variants[0].price).toLocaleString('es')}</Text>}
                </ResourceItem>
              )}
            />
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
