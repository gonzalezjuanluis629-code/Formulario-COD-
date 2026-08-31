import { useState } from 'react';
import {
  BlockStack, Card, InlineStack, Layout, Page, Text, TextField, Toast, Banner, Button,
} from '@shopify/polaris';
import { useFetcher, useLoaderData } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { ShopSettingsSchema } from '@cod/contracts';
import { DO_PROVINCES } from '@cod/geo';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  return { settings: ShopSettingsSchema.parse(shop.settings ?? {}), currency: shop.currency };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();

  const current = ShopSettingsSchema.parse(shop.settings ?? {});
  const patch = JSON.parse(String(fd.get('patch'))) as Partial<typeof current>;

  await db.shop.update({
    where: { id: shop.id },
    data: { settings: { ...current, ...patch } as object },
  });
  return { ok: true, message: 'Envíos actualizados. Se aplican en tu tienda en menos de 1 minuto.' };
}

export default function Shipping() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ message: string }>();

  const [defaultCents, setDefaultCents] = useState(settings.defaultShippingCents);
  const [freeOver, setFreeOver] = useState(settings.freeShippingOverCents);
  const [byProvince, setByProvince] = useState<Record<string, number>>(settings.shippingByProvince);
  const [codFee, setCodFee] = useState(settings.codFeeCents);
  const [codFeeLabel, setCodFeeLabel] = useState(settings.codFeeLabel);

  const save = () =>
    fetcher.submit(
      {
        patch: JSON.stringify({
          defaultShippingCents: defaultCents,
          freeShippingOverCents: freeOver,
          shippingByProvince: byProvince,
          codFeeCents: codFee,
          codFeeLabel,
        }),
      },
      { method: 'post' },
    );

  const setProvince = (code: string, pesos: string) => {
    const next = { ...byProvince };
    if (pesos === '') delete next[code];
    else next[code] = Math.round(Number(pesos) * 100);
    setByProvince(next);
  };

  return (
    <Page
      title="Envíos"
      subtitle="Cobra un precio distinto por provincia. Lo que no configures usa la tarifa general."
      primaryAction={{ content: 'Guardar', loading: fetcher.state !== 'idle', onAction: save }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Tarifa general</Text>
              <InlineStack gap="300" wrap={false}>
                <TextField label="Costo de envío por defecto" type="number"
                  value={String(defaultCents / 100)}
                  onChange={(v) => setDefaultCents(Math.round(Number(v) * 100))}
                  prefix="RD$" autoComplete="off"
                  helpText="Se usa en las provincias sin tarifa propia." />
                <TextField label="Envío gratis a partir de" type="number"
                  value={freeOver ? String(freeOver / 100) : ''}
                  onChange={(v) => setFreeOver(v ? Math.round(Number(v) * 100) : null)}
                  prefix="RD$" autoComplete="off" helpText="Vacío para desactivar." />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Recargo contra entrega (COD fee)</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Un cargo extra por pagar al recibir. Muchas tiendas lo usan para incentivar el prepago.
              </Text>
              <InlineStack gap="300" wrap={false}>
                <TextField label="Monto del recargo" type="number"
                  value={String(codFee / 100)}
                  onChange={(v) => setCodFee(Math.round(Number(v) * 100))}
                  prefix="RD$" autoComplete="off" helpText="0 = sin recargo." />
                <TextField label="Nombre del recargo" value={codFeeLabel}
                  onChange={setCodFeeLabel} autoComplete="off" />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Tarifa por provincia</Text>
              <Banner tone="info">
                <p>
                  Deja en blanco las provincias que cobren la tarifa general. Solo llena las que tengan
                  un precio distinto (ej. zonas lejanas más caras).
                </p>
              </Banner>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {DO_PROVINCES.map((p) => (
                  <InlineStack key={p.code} gap="200" blockAlign="center" wrap={false}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text as="span" variant="bodySm" truncate>{p.name}</Text>
                    </div>
                    <div style={{ width: 120 }}>
                      <TextField
                        labelHidden label={p.name} type="number" autoComplete="off"
                        prefix="RD$"
                        placeholder={String(defaultCents / 100)}
                        value={byProvince[p.code] != null ? String(byProvince[p.code] / 100) : ''}
                        onChange={(v) => setProvince(p.code, v)}
                      />
                    </div>
                  </InlineStack>
                ))}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {fetcher.data?.message && <Toast content={fetcher.data.message} onDismiss={() => {}} />}
    </Page>
  );
}
