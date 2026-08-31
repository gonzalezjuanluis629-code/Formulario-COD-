import { Card, Layout, Page, Text, BlockStack, InlineStack, Badge, Button, Banner } from '@shopify/polaris';
import { Link, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [forms, confirmed, failed, withGps, total] = await Promise.all([
    db.form.count({ where: { shopId: shop.id, status: 'ACTIVE' } }),
    db.submission.count({ where: { shopId: shop.id, status: 'CONFIRMED', createdAt: { gte: since } } }),
    db.submission.count({ where: { shopId: shop.id, status: 'FAILED' } }),
    db.submission.count({
      where: { shopId: shop.id, status: 'CONFIRMED', createdAt: { gte: since }, latitude: { not: null } },
    }),
    db.submission.count({ where: { shopId: shop.id, createdAt: { gte: since } } }),
  ]);

  return { forms, confirmed, failed, withGps, total, currency: shop.currency };
}

export default function Dashboard() {
  const d = useLoaderData<typeof loader>();
  const conversion = d.total ? Math.round((d.confirmed / d.total) * 100) : 0;
  const gpsRate = d.confirmed ? Math.round((d.withGps / d.confirmed) * 100) : 0;

  return (
    <Page title="COD Forms">
      <Layout>
        {/* Un pedido fallido es dinero parado. Va lo primero, imposible de ignorar. */}
        {d.failed > 0 && (
          <Layout.Section>
            <Banner tone="critical" title={`${d.failed} pedido(s) no llegaron a Shopify`}>
              <p>Están guardados y se pueden reintentar. Nada se ha perdido.</p>
              <Link to="/app/orders?status=FAILED"><Button variant="primary" tone="critical">Revisar</Button></Link>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Stat label="Pedidos (30 días)" value={String(d.confirmed)} />
            <Stat label="Conversión del formulario" value={`${conversion} %`} />
            <Stat label="Pedidos con ubicación GPS" value={`${gpsRate} %`}
              hint="Cuanto más alto, menos entregas fallidas" />
            <Stat label="Formularios activos" value={String(d.forms)} />
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Primeros pasos</Text>
              <BlockStack gap="200">
                <Text as="p">1. Diseña tu formulario y publícalo.</Text>
                <Text as="p">2. Añádelo a la página de producto desde el editor del tema (bloque «Formulario COD»).</Text>
                <Text as="p">3. Configura la página de gracias en Ajustes.</Text>
              </BlockStack>
              <InlineStack gap="200">
                <Link to="/app/forms"><Button variant="primary">Ir a los formularios</Button></Link>
                <Link to="/app/settings"><Button>Ajustes</Button></Link>
              </InlineStack>
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
