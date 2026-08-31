import { Badge, Button, Card, IndexTable, Page, Text, Banner, InlineStack, Tabs } from '@shopify/polaris';
import { useState } from 'react';
import { Form, useLoaderData, useSearchParams } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { requireShop } from '../lib/shop.server';
import { decryptForShop } from '../lib/crypto.server';
import { db } from '../db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  const rows = await db.submission.findMany({
    where: { shopId: shop.id, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  /**
   * El resumen del pedido vive AQUÍ: solo lo ve el administrador.
   * La PII se descifra al vuelo y nunca sale del servidor sin necesidad.
   */
  const orders = rows.map((s) => {
    let pii: { firstName?: string; lastName?: string; phoneE164?: string; email?: string | null } = {};
    try {
      if (s.customerDataEnc) pii = JSON.parse(decryptForShop(shop.id, Buffer.from(s.customerDataEnc)));
    } catch { /* datos purgados por GDPR: la fila sigue, el contenido no */ }

    const totals = s.totals as { totalCents: number };

    return {
      id: s.id,
      status: s.status,
      name: [pii.firstName, pii.lastName].filter(Boolean).join(' ') || '—',
      phone: pii.phoneE164 ?? '—',
      total: totals?.totalCents ? (totals.totalCents / 100).toLocaleString('en-US') : '—',
      orderName: s.shopifyOrderName,
      risk: s.riskScore,
      flags: s.riskFlags,
      hasGps: s.latitude != null,
      mapUrl: s.latitude != null ? `https://maps.google.com/?q=${s.latitude},${s.longitude}` : null,
      error: s.lastError,
      createdAt: s.createdAt.toLocaleString('es-DO'),
    };
  });

  const [failed, held] = await Promise.all([
    db.submission.count({ where: { shopId: shop.id, status: 'FAILED' } }),
    db.submission.count({ where: { shopId: shop.id, status: 'HELD' } }),
  ]);
  return { orders, failed, held, currency: shop.currency };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();

  /* Reintento manual: se vuelve a encolar en el outbox. El worker lo recoge en 2 s. */
  if (String(fd.get('intent')) === 'retry') {
    const id = String(fd.get('id'));
    const s = await db.submission.findFirstOrThrow({ where: { id, shopId: shop.id } });

    await db.$transaction([
      db.submission.update({ where: { id: s.id }, data: { status: 'PENDING', lastError: null } }),
      db.outboxEvent.create({
        data: { shopId: shop.id, type: 'ORDER_CREATE', payload: { submissionId: s.id } as object },
      }),
    ]);
  }

  /* Aprobar un pedido retenido: ahora sí se encola hacia Shopify. */
  if (String(fd.get('intent')) === 'approve') {
    const id = String(fd.get('id'));
    const s = await db.submission.findFirstOrThrow({
      where: { id, shopId: shop.id, status: 'HELD' },
    });
    await db.$transaction([
      db.submission.update({ where: { id: s.id }, data: { status: 'PENDING' } }),
      db.outboxEvent.create({
        data: { shopId: shop.id, type: 'ORDER_CREATE', payload: { submissionId: s.id } as object },
      }),
    ]);
  }

  /* Rechazar un pedido retenido: no se crea en Shopify. Opción de bloquear el teléfono. */
  if (String(fd.get('intent')) === 'reject') {
    const id = String(fd.get('id'));
    const blockPhone = fd.get('blockPhone') === '1';
    const s = await db.submission.findFirstOrThrow({ where: { id, shopId: shop.id } });

    await db.submission.update({ where: { id: s.id }, data: { status: 'REJECTED' } });
    if (blockPhone && s.phoneHash) {
      await db.blocklistEntry.upsert({
        where: { shopId_type_valueHash: { shopId: shop.id, type: 'PHONE', valueHash: s.phoneHash } },
        update: {},
        create: { shopId: shop.id, type: 'PHONE', valueHash: s.phoneHash, reason: 'Rechazado manualmente' },
      });
    }
  }
  return null;
}

export default function Orders() {
  const { orders, failed, held, currency } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const initial = params.get('status') === 'FAILED' ? 1 : params.get('status') === 'HELD' ? 2 : 0;
  const [tab, setTab] = useState(initial);

  const tabs = [
    { id: 'all', content: 'Todos' },
    { id: 'failed', content: `Con error${failed ? ` (${failed})` : ''}` },
    { id: 'held', content: `En revisión${held ? ` (${held})` : ''}` },
  ];

  return (
    <Page
      title="Pedidos"
      subtitle="El resumen completo solo lo ves tú. El cliente nunca lo ve."
      secondaryActions={[{ content: 'Exportar CSV', url: '/app/orders/export', external: true }]}
    >
      {held > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="warning" title={`${held} pedido(s) esperan tu revisión`}>
            <p>
              Estos pedidos tienen riesgo alto y no se enviaron a Shopify automáticamente.
              Apruébalos o recházalos en la pestaña «En revisión».
            </p>
          </Banner>
        </div>
      )}
      {failed > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="critical" title={`${failed} pedido(s) no llegaron a Shopify`}>
            <p>
              Los datos están a salvo. Suele ser un código de provincia que Shopify no reconoce.
              Pulsa «Reintentar» tras corregirlo.
            </p>
          </Banner>
        </div>
      )}

      <Card padding="0">
        <Tabs
          tabs={tabs}
          selected={tab}
          onSelect={(i) => {
            setTab(i);
            setParams(i === 1 ? { status: 'FAILED' } : i === 2 ? { status: 'HELD' } : {});
          }}
        >
          <IndexTable
            itemCount={orders.length}
            selectable={false}
            headings={[
              { title: 'Cliente' }, { title: 'Teléfono' }, { title: 'Total' },
              { title: 'Pedido' }, { title: 'Ubicación' }, { title: 'Riesgo' },
              { title: 'Estado' }, { title: '' },
            ]}
          >
            {orders.map((o, i) => (
              <IndexTable.Row id={o.id} key={o.id} position={i}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{o.name}</Text>
                  <div><Text as="span" variant="bodySm" tone="subdued">{o.createdAt}</Text></div>
                </IndexTable.Cell>
                <IndexTable.Cell>{o.phone}</IndexTable.Cell>
                <IndexTable.Cell>{currency === 'DOP' ? 'RD$ ' : ''}{o.total}</IndexTable.Cell>
                <IndexTable.Cell>{o.orderName ?? '—'}</IndexTable.Cell>
                <IndexTable.Cell>
                  {o.mapUrl ? (
                    <a href={o.mapUrl} target="_blank" rel="noreferrer">Ver mapa</a>
                  ) : (
                    <Text as="span" tone="subdued">Escrita</Text>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {o.risk >= 50 ? (
                    <Badge tone="critical">{`Alto (${o.risk})`}</Badge>
                  ) : o.risk >= 25 ? (
                    <Badge tone="warning">{`Medio (${o.risk})`}</Badge>
                  ) : (
                    <Badge tone="success">Bajo</Badge>
                  )}
                  {o.flags.includes('GPS_PROVINCE_MISMATCH') && (
                    <div><Text as="span" variant="bodySm" tone="critical">GPS ≠ provincia</Text></div>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={
                    o.status === 'CONFIRMED' ? 'success'
                      : o.status === 'FAILED' ? 'critical'
                      : o.status === 'HELD' ? 'warning'
                      : o.status === 'REJECTED' ? 'critical'
                      : o.status === 'PENDING' ? 'attention' : undefined
                  }>
                    {o.status === 'CONFIRMED' ? 'En Shopify'
                      : o.status === 'FAILED' ? 'Con error'
                      : o.status === 'HELD' ? 'En revisión'
                      : o.status === 'REJECTED' ? 'Rechazado'
                      : o.status === 'PENDING' ? 'Enviando…' : o.status}
                  </Badge>
                  {o.error && (
                    <div style={{ maxWidth: 220 }}>
                      <Text as="span" variant="bodySm" tone="critical" truncate>{o.error}</Text>
                    </div>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {o.status === 'FAILED' && (
                    <Form method="post">
                      <input type="hidden" name="id" value={o.id} />
                      <Button size="micro" variant="primary" name="intent" value="retry" submit>
                        Reintentar
                      </Button>
                    </Form>
                  )}
                  {o.status === 'HELD' && (
                    <Form method="post" style={{ display: 'flex', gap: 6 }}>
                      <input type="hidden" name="id" value={o.id} />
                      <Button size="micro" variant="primary" name="intent" value="approve" submit>
                        Aprobar
                      </Button>
                      <Button size="micro" tone="critical" variant="tertiary" name="intent" value="reject" submit>
                        Rechazar
                      </Button>
                      <Button size="micro" tone="critical" variant="tertiary"
                        name="intent" value="reject" submit
                        onClick={(e) => {
                          const f = (e.currentTarget as HTMLElement).closest('form');
                          const inp = document.createElement('input');
                          inp.type = 'hidden'; inp.name = 'blockPhone'; inp.value = '1';
                          f?.appendChild(inp);
                        }}>
                        Rechazar y bloquear
                      </Button>
                    </Form>
                  )}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Tabs>
      </Card>
    </Page>
  );
}
