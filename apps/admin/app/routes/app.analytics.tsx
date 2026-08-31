import { Card, Layout, Page, Text, BlockStack, InlineStack, Badge } from '@shopify/polaris';
import { useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);
  from.setUTCHours(0, 0, 0, 0);

  const rows = await db.analyticsDaily.findMany({
    where: { shopId: shop.id, date: { gte: from } },
    orderBy: { date: 'asc' },
  });

  const t = rows.reduce(
    (a, r) => ({
      views: a.views + r.views,
      starts: a.starts + r.starts,
      submissions: a.submissions + r.submissions,
      confirmed: a.confirmed + r.confirmed,
      abandoned: a.abandoned + r.abandoned,
      withGps: a.withGps + r.withGpsLocation,
      revenueCents: a.revenueCents + Number(r.revenueCents),
    }),
    { views: 0, starts: 0, submissions: 0, confirmed: 0, abandoned: 0, withGps: 0, revenueCents: 0 },
  );

  return { t, currency: shop.currency };
}

export default function Analytics() {
  const { t, currency } = useLoaderData<typeof loader>();
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const money = (c: number) => `${currency === 'DOP' ? 'RD$' : ''} ${(c / 100).toLocaleString('en-US')}`;

  // Embudo: cada paso como % del anterior, para ver dónde se cae la gente.
  const funnel = [
    { label: 'Vieron el formulario', value: t.views, of: t.views },
    { label: 'Empezaron a llenarlo', value: t.starts, of: t.views },
    { label: 'Lo enviaron', value: t.submissions, of: t.starts },
    { label: 'Pedido en Shopify', value: t.confirmed, of: t.submissions },
  ];

  return (
    <Page title="Analítica" subtitle="Últimos 30 días">
      <Layout>
        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Stat label="Ingreso (COD)" value={money(t.revenueCents)} />
            <Stat label="Conversión total" value={`${pct(t.confirmed, t.views)} %`} />
            <Stat label="Pedidos con GPS" value={`${pct(t.withGps, t.confirmed)} %`} hint="Menos entregas fallidas" />
            <Stat label="Abandonos" value={String(t.abandoned)} />
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Embudo</Text>
              {funnel.map((step, i) => (
                <BlockStack gap="100" key={i}>
                  <InlineStack align="space-between">
                    <Text as="span">{step.label}</Text>
                    <InlineStack gap="200">
                      <Text as="span" fontWeight="semibold">{step.value}</Text>
                      {i > 0 && <Badge tone={pct(step.value, step.of) < 50 ? 'warning' : 'success'}>
                        {`${pct(step.value, step.of)} %`}
                      </Badge>}
                    </InlineStack>
                  </InlineStack>
                  <div style={{ height: 8, background: '#f0f0f0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99, background: '#008060',
                      width: `${pct(step.value, funnel[0].value || 1)}%`,
                    }} />
                  </div>
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ minWidth: 200, flex: 1 }}>
      <Card>
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
          <Text as="p" variant="heading2xl">{value}</Text>
          {hint && <Text as="p" variant="bodySm" tone="subdued">{hint}</Text>}
        </BlockStack>
      </Card>
    </div>
  );
}
