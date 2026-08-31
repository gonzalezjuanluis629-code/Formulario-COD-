import {
  Badge, BlockStack, Button, Card, EmptyState, Form as PForm, IndexTable, InlineStack,
  Layout, Modal, Page, Select, Text, TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { Form, useLoaderData, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const [offers, addons, discounts] = await Promise.all([
    db.offer.findMany({ where: { shopId: shop.id, type: 'QUANTITY' }, orderBy: { priority: 'desc' } }),
    db.offer.findMany({
      where: { shopId: shop.id, type: { in: ['UPSELL', 'ORDER_BUMP', 'DOWNSELL'] } },
      orderBy: { priority: 'desc' },
    }),
    db.discount.findMany({ where: { shopId: shop.id }, orderBy: { name: 'asc' } }),
  ]);
  return { offers, addons, discounts, currency: shop.currency };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const intent = String(fd.get('intent'));

  if (intent === 'offer:create') {
    const minQty = Number(fd.get('minQty'));
    const kind = String(fd.get('kind'));
    const value = Number(fd.get('value') || 0);

    await db.offer.create({
      data: {
        shopId: shop.id,
        name: String(fd.get('name')),
        type: 'QUANTITY',
        priority: minQty, // a mayor cantidad, mayor prioridad: gana la mejor oferta
        payload: {
          minQty,
          discountBps: kind === 'PERCENTAGE' ? Math.round(value * 100) : 0,
          freeShipping: kind === 'FREE_SHIPPING',
        },
      },
    });
  }

  if (intent === 'offer:toggle') {
    const o = await db.offer.findFirstOrThrow({ where: { id: String(fd.get('id')), shopId: shop.id } });
    await db.offer.update({ where: { id: o.id }, data: { active: !o.active } });
  }

  if (intent === 'offer:delete') {
    await db.offer.deleteMany({ where: { id: String(fd.get('id')), shopId: shop.id } });
  }

  /* ── Addons: order bump / upsell / downsell ── */
  if (intent === 'addon:create') {
    const kind = String(fd.get('kind')) as 'ORDER_BUMP' | 'UPSELL' | 'DOWNSELL';
    const variantId = String(fd.get('variantId')).trim();
    const priceCents = Math.round(Number(fd.get('price') || 0) * 100);
    const compareAt = fd.get('compareAt') ? Math.round(Number(fd.get('compareAt')) * 100) : null;

    await db.offer.create({
      data: {
        shopId: shop.id,
        name: String(fd.get('title')),
        type: kind,
        priority: kind === 'ORDER_BUMP' ? 10 : 5,
        payload: {
          kind,
          variantId,
          title: String(fd.get('title')),
          description: String(fd.get('description') || ''),
          image: String(fd.get('image') || '') || null,
          priceCents,
          compareAtCents: compareAt,
          qty: 1,
          replacesId: String(fd.get('replacesId') || '') || null,
          minCartCents: 0,
        },
      },
    });
  }

  if (intent === 'addon:toggle') {
    const o = await db.offer.findFirstOrThrow({ where: { id: String(fd.get('id')), shopId: shop.id } });
    await db.offer.update({ where: { id: o.id }, data: { active: !o.active } });
  }

  if (intent === 'addon:delete') {
    await db.offer.deleteMany({ where: { id: String(fd.get('id')), shopId: shop.id } });
  }

  if (intent === 'discount:create') {
    const type = String(fd.get('type')) as 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING';
    const value = Number(fd.get('value') || 0);

    await db.discount.create({
      data: {
        shopId: shop.id,
        name: String(fd.get('name')),
        code: String(fd.get('code')).toUpperCase(),
        type,
        payload: type === 'PERCENTAGE'
          ? { valueBps: Math.round(value * 100) }
          : type === 'FIXED'
            ? { valueCents: Math.round(value * 100) }
            : {},
      },
    });
  }

  if (intent === 'discount:delete') {
    await db.discount.deleteMany({ where: { id: String(fd.get('id')), shopId: shop.id } });
  }

  return null;
}

export default function Offers() {
  const { offers, addons, discounts } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [modal, setModal] = useState<'offer' | 'discount' | 'addon' | null>(null);
  const [addonKind, setAddonKind] = useState<'ORDER_BUMP' | 'UPSELL' | 'DOWNSELL'>('ORDER_BUMP');

  return (
    <Page title="Ofertas y descuentos">
      <Layout>
        {/* ── Ofertas por cantidad ── */}
        <Layout.Section>
          <Card padding="0">
            <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Ofertas por cantidad</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Se aplican solas cuando el cliente sube la cantidad. Gana siempre la mejor.
                </Text>
              </BlockStack>
              <Button variant="primary" onClick={() => setModal('offer')}>Crear oferta</Button>
            </div>

            {offers.length === 0 ? (
              <div style={{ padding: '0 16px 20px' }}>
                <Text as="p" tone="subdued">
                  Ej.: «Compra 2 y llévate 10 %», «Compra 3 y el envío es gratis».
                </Text>
              </div>
            ) : (
              <IndexTable
                itemCount={offers.length}
                selectable={false}
                headings={[{ title: 'Oferta' }, { title: 'Desde' }, { title: 'Beneficio' }, { title: 'Estado' }, { title: '' }]}
              >
                {offers.map((o, i) => {
                  const p = o.payload as { minQty: number; discountBps: number; freeShipping: boolean };
                  return (
                    <IndexTable.Row id={o.id} key={o.id} position={i}>
                      <IndexTable.Cell><Text as="span" fontWeight="semibold">{o.name}</Text></IndexTable.Cell>
                      <IndexTable.Cell>{p.minQty} unidades</IndexTable.Cell>
                      <IndexTable.Cell>
                        {p.freeShipping ? 'Envío gratis' : `${(p.discountBps / 100).toFixed(0)} % de descuento`}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={o.active ? 'success' : undefined}>{o.active ? 'Activa' : 'Pausada'}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Form method="post" style={{ display: 'flex', gap: 6 }}>
                          <input type="hidden" name="id" value={o.id} />
                          <Button size="micro" name="intent" value="offer:toggle" submit>
                            {o.active ? 'Pausar' : 'Activar'}
                          </Button>
                          <Button size="micro" tone="critical" variant="tertiary" name="intent" value="offer:delete" submit>
                            Eliminar
                          </Button>
                        </Form>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>

        {/* ── Upsells, bumps y downsells ── */}
        <Layout.Section>
          <Card padding="0">
            <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Upsells y order bumps</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Order bump = casilla de un clic. Upsell = tarjeta con «Añadir». Downsell = alternativa
                  si rechaza un upsell.
                </Text>
              </BlockStack>
              <Button variant="primary" onClick={() => { setAddonKind('ORDER_BUMP'); setModal('addon'); }}>
                Crear
              </Button>
            </div>

            {addons.length === 0 ? (
              <div style={{ padding: '0 16px 20px' }}>
                <Text as="p" tone="subdued">
                  Ej.: «Añade la garantía extendida por RD$ 290» (order bump), o «Llévate también el estuche»
                  (upsell).
                </Text>
              </div>
            ) : (
              <IndexTable
                itemCount={addons.length}
                selectable={false}
                headings={[{ title: 'Producto' }, { title: 'Tipo' }, { title: 'Precio' }, { title: 'Aceptados' }, { title: 'Estado' }, { title: '' }]}
              >
                {addons.map((a, i) => {
                  const p = a.payload as { title: string; priceCents: number; kind: string };
                  return (
                    <IndexTable.Row id={a.id} key={a.id} position={i}>
                      <IndexTable.Cell><Text as="span" fontWeight="semibold">{p.title}</Text></IndexTable.Cell>
                      <IndexTable.Cell>
                        {p.kind === 'ORDER_BUMP' ? 'Order bump' : p.kind === 'UPSELL' ? 'Upsell' : 'Downsell'}
                      </IndexTable.Cell>
                      <IndexTable.Cell>RD$ {(p.priceCents / 100).toLocaleString('en-US')}</IndexTable.Cell>
                      <IndexTable.Cell>{a.accepts}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={a.active ? 'success' : undefined}>{a.active ? 'Activo' : 'Pausado'}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Form method="post" style={{ display: 'flex', gap: 6 }}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button size="micro" name="intent" value="addon:toggle" submit>
                            {a.active ? 'Pausar' : 'Activar'}
                          </Button>
                          <Button size="micro" tone="critical" variant="tertiary" name="intent" value="addon:delete" submit>
                            Eliminar
                          </Button>
                        </Form>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>

        {/* ── Cupones ── */}
        <Layout.Section>
          <Card padding="0">
            <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Cupones</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  El formulario valida primero los códigos reales de Shopify. Si no existen allí, busca aquí.
                </Text>
              </BlockStack>
              <Button variant="primary" onClick={() => setModal('discount')}>Crear cupón</Button>
            </div>

            {discounts.length > 0 && (
              <IndexTable
                itemCount={discounts.length}
                selectable={false}
                headings={[{ title: 'Código' }, { title: 'Nombre' }, { title: 'Tipo' }, { title: 'Usos' }, { title: '' }]}
              >
                {discounts.map((d, i) => (
                  <IndexTable.Row id={d.id} key={d.id} position={i}>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">{d.code}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{d.name}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {d.type === 'PERCENTAGE' ? 'Porcentaje' : d.type === 'FIXED' ? 'Monto fijo' : 'Envío gratis'}
                    </IndexTable.Cell>
                    <IndexTable.Cell>{d.usageCount}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Form method="post">
                        <input type="hidden" name="id" value={d.id} />
                        <Button size="micro" tone="critical" variant="tertiary" name="intent" value="discount:delete" submit>
                          Eliminar
                        </Button>
                      </Form>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <OfferModal open={modal === 'offer'} onClose={() => setModal(null)} submit={submit} />
      <DiscountModal open={modal === 'discount'} onClose={() => setModal(null)} submit={submit} />
      <AddonModal open={modal === 'addon'} onClose={() => setModal(null)} submit={submit}
        addons={addons} defaultKind={addonKind} />
    </Page>
  );
}

function OfferModal({ open, onClose, submit }: { open: boolean; onClose: () => void; submit: ReturnType<typeof useSubmit> }) {
  const [name, setName] = useState('');
  const [minQty, setMinQty] = useState('2');
  const [kind, setKind] = useState('PERCENTAGE');
  const [value, setValue] = useState('10');

  return (
    <Modal
      open={open} onClose={onClose} title="Crear oferta por cantidad"
      primaryAction={{
        content: 'Crear',
        onAction: () => {
          submit({ intent: 'offer:create', name: name || `Compra ${minQty}`, minQty, kind, value }, { method: 'post' });
          onClose();
        },
      }}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <TextField label="Nombre (lo ve el cliente)" value={name} onChange={setName}
            placeholder="Ej. Llévate 2 y ahorra" autoComplete="off" />
          <TextField label="A partir de (unidades)" type="number" value={minQty} onChange={setMinQty} autoComplete="off" />
          <Select label="Beneficio" value={kind} onChange={setKind}
            options={[
              { label: 'Descuento en porcentaje', value: 'PERCENTAGE' },
              { label: 'Envío gratis', value: 'FREE_SHIPPING' },
            ]} />
          {kind === 'PERCENTAGE' && (
            <TextField label="Porcentaje" type="number" value={value} onChange={setValue} suffix="%" autoComplete="off" />
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function DiscountModal({ open, onClose, submit }: { open: boolean; onClose: () => void; submit: ReturnType<typeof useSubmit> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('PERCENTAGE');
  const [value, setValue] = useState('10');

  return (
    <Modal
      open={open} onClose={onClose} title="Crear cupón"
      primaryAction={{
        content: 'Crear',
        onAction: () => {
          submit({ intent: 'discount:create', name: name || code, code, type, value }, { method: 'post' });
          onClose();
        },
      }}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <TextField label="Código" value={code} onChange={(v) => setCode(v.toUpperCase())}
            placeholder="BIENVENIDO10" autoComplete="off" />
          <TextField label="Nombre interno" value={name} onChange={setName} autoComplete="off" />
          <Select label="Tipo" value={type} onChange={setType}
            options={[
              { label: 'Porcentaje', value: 'PERCENTAGE' },
              { label: 'Monto fijo', value: 'FIXED' },
              { label: 'Envío gratis', value: 'FREE_SHIPPING' },
            ]} />
          {type !== 'FREE_SHIPPING' && (
            <TextField label={type === 'PERCENTAGE' ? 'Porcentaje' : 'Monto'} type="number"
              value={value} onChange={setValue} suffix={type === 'PERCENTAGE' ? '%' : 'RD$'} autoComplete="off" />
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function AddonModal({
  open, onClose, submit, addons, defaultKind,
}: {
  open: boolean;
  onClose: () => void;
  submit: ReturnType<typeof useSubmit>;
  addons: { id: string; payload: unknown }[];
  defaultKind: 'ORDER_BUMP' | 'UPSELL' | 'DOWNSELL';
}) {
  const [kind, setKind] = useState<'ORDER_BUMP' | 'UPSELL' | 'DOWNSELL'>(defaultKind);
  const [variantId, setVariantId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [price, setPrice] = useState('');
  const [compareAt, setCompareAt] = useState('');
  const [replacesId, setReplacesId] = useState('');

  // Para el downsell: a qué upsell reemplaza.
  const upsells = addons.filter((a) => (a.payload as { kind?: string }).kind === 'UPSELL');

  const create = () => {
    submit(
      {
        intent: 'addon:create',
        kind, variantId, title: title || 'Producto extra', description, image,
        price, compareAt, replacesId: kind === 'DOWNSELL' ? replacesId : '',
      },
      { method: 'post' },
    );
    onClose();
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Crear upsell / order bump"
      primaryAction={{ content: 'Crear', onAction: create, disabled: !variantId || !price }}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Select
            label="Tipo"
            value={kind}
            options={[
              { label: 'Order bump (casilla de un clic)', value: 'ORDER_BUMP' },
              { label: 'Upsell (tarjeta con «Añadir»)', value: 'UPSELL' },
              { label: 'Downsell (alternativa si rechaza un upsell)', value: 'DOWNSELL' },
            ]}
            onChange={(v) => setKind(v as 'ORDER_BUMP' | 'UPSELL' | 'DOWNSELL')}
          />

          {kind === 'DOWNSELL' && (
            <Select
              label="Se ofrece si rechaza este upsell"
              value={replacesId}
              options={[
                { label: 'Selecciona un upsell…', value: '' },
                ...upsells.map((u) => ({
                  label: (u.payload as { title: string }).title,
                  value: u.id,
                })),
              ]}
              onChange={setReplacesId}
            />
          )}

          <TextField
            label="ID de la variante"
            value={variantId}
            onChange={setVariantId}
            autoComplete="off"
            placeholder="gid://shopify/ProductVariant/1234567890"
            helpText="Cópialo desde el producto en Shopify. El precio se toma de esa variante al cobrar."
          />
          <TextField label="Título (lo ve el cliente)" value={title} onChange={setTitle}
            autoComplete="off" placeholder="Ej. Garantía extendida 12 meses" />
          <TextField label="Descripción" value={description} onChange={setDescription}
            autoComplete="off" multiline={2} />
          <TextField label="URL de la imagen" value={image} onChange={setImage}
            autoComplete="off" helpText="Opcional. Súbela a Archivos de Shopify y pega la URL." />
          <InlineStack gap="200" wrap={false}>
            <TextField label="Precio" type="number" value={price} onChange={setPrice}
              prefix="RD$" autoComplete="off"
              helpText="Informativo: el cobro usa el precio real de la variante." />
            <TextField label="Precio comparado" type="number" value={compareAt} onChange={setCompareAt}
              prefix="RD$" autoComplete="off" helpText="Opcional (precio tachado)." />
          </InlineStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
