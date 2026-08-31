import { useState } from 'react';
import {
  BlockStack, Card, Checkbox, Frame, Layout, Page, Select, Text, TextField, Toast, Banner,
} from '@shopify/polaris';
import { useFetcher, useLoaderData } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { ShopSettingsSchema, LocationConfigSchema, type ShopSettings, type LocationConfig } from '@cod/contracts';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const raw = (shop.settings ?? {}) as Record<string, unknown>;
  return {
    settings: ShopSettingsSchema.parse(raw),
    location: LocationConfigSchema.parse(raw.location ?? {}),
    domain: shop.domain,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();

  const settings = ShopSettingsSchema.parse(JSON.parse(String(fd.get('settings'))));
  const location = LocationConfigSchema.parse(JSON.parse(String(fd.get('location'))));

  await db.shop.update({
    where: { id: shop.id },
    data: { settings: { ...settings, location } as object },
  });
  return { ok: true, message: 'Ajustes guardados.' };
}

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ message: string }>();
  const [s, setS] = useState<ShopSettings>(data.settings);
  const [l, setL] = useState<LocationConfig>(data.location);

  const save = () =>
    fetcher.submit(
      { settings: JSON.stringify(s), location: JSON.stringify(l) },
      { method: 'post' },
    );

  return (
    <Frame>
      <Page
        title="Ajustes"
        primaryAction={{ content: 'Guardar', loading: fetcher.state !== 'idle', onAction: save }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Pantalla de confirmación</Text>

                <TextField
                  label="Título"
                  value={s.confirmation.title}
                  onChange={(v) => setS({ ...s, confirmation: { ...s.confirmation, title: v } })}
                  autoComplete="off"
                  placeholder="¡Pedido confirmado!"
                />
                <TextField
                  label="Mensaje"
                  value={s.confirmation.message}
                  onChange={(v) => setS({ ...s, confirmation: { ...s.confirmation, message: v } })}
                  autoComplete="off" multiline={2}
                />

                <Select
                  label="A dónde va el cliente después"
                  value={s.confirmation.redirectTarget}
                  options={[
                    { label: 'Página de agradecimiento del tema', value: 'thankyou' },
                    { label: 'Conversación de WhatsApp con nosotros', value: 'whatsapp' },
                    { label: 'Se queda en la confirmación', value: 'none' },
                  ]}
                  onChange={(v) =>
                    setS({ ...s, confirmation: { ...s.confirmation, redirectTarget: v as never } })}
                />

                <TextField
                  label="Segundos antes de redirigir"
                  type="number"
                  value={String(s.redirectDelayMs / 1000)}
                  onChange={(v) => setS({ ...s, redirectDelayMs: Math.round(Number(v) * 1000) })}
                  autoComplete="off"
                />

                {s.confirmation.redirectTarget === 'thankyou' && (
                  <>
                    <Banner tone="info">
                      <p>
                        La página de agradecimiento nativa de Shopify solo existe para pedidos del
                        checkout. Como el formulario crea el pedido por API, se envía al cliente a una
                        página de tu tema.
                      </p>
                    </Banner>
                    <TextField
                      label="Página de agradecimiento"
                      value={s.thankYouUrl}
                      onChange={(v) => setS({ ...s, thankYouUrl: v })}
                      autoComplete="off"
                      prefix={`https://${data.domain}`}
                      helpText="Créala en tu tema. Ahí puedes poner tus píxeles de conversión."
                    />
                  </>
                )}

                {s.confirmation.redirectTarget === 'whatsapp' && (
                  <>
                    <TextField
                      label="Número de WhatsApp (con código de país, sin +)"
                      value={s.confirmation.whatsapp.phone}
                      onChange={(v) =>
                        setS({ ...s, confirmation: {
                          ...s.confirmation,
                          whatsapp: { ...s.confirmation.whatsapp, enabled: true, phone: v.replace(/\D/g, '') },
                        } })}
                      autoComplete="off"
                      prefix="+"
                      placeholder="18095551234"
                      helpText="Ej. para RD: 1 809 555 1234 → escribe 18095551234"
                    />
                    <TextField
                      label="Mensaje que enviará el cliente"
                      value={s.confirmation.whatsapp.messageTemplate}
                      onChange={(v) =>
                        setS({ ...s, confirmation: {
                          ...s.confirmation,
                          whatsapp: { ...s.confirmation.whatsapp, messageTemplate: v },
                        } })}
                      autoComplete="off" multiline={3}
                      helpText="Variables disponibles: {nombre}, {telefono}. Ej: «Hola, soy {nombre} y ya realicé mi pedido»."
                    />
                  </>
                )}

                <Checkbox
                  label="Mostrar el resumen del pedido al cliente"
                  checked={s.showOrderSummaryToCustomer}
                  onChange={(v) => setS({ ...s, showOrderSummaryToCustomer: v })}
                  helpText="Desactivado: el cliente solo ve la confirmación. El resumen completo lo ves tú en Pedidos."
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Pedido en Shopify</Text>
                <TextField label="Etiqueta del pedido" value={s.orderTag}
                  onChange={(v) => setS({ ...s, orderTag: v })} autoComplete="off"
                  helpText="Se añade a cada pedido creado por el formulario." />
                <TextField label="Nombre del método de pago" value={s.gateway}
                  onChange={(v) => setS({ ...s, gateway: v })} autoComplete="off" />
                <TextField label="Costo de envío" type="number"
                  value={String(s.defaultShippingCents / 100)}
                  onChange={(v) => setS({ ...s, defaultShippingCents: Math.round(Number(v) * 100) })}
                  prefix="RD$" autoComplete="off" />
                <TextField label="Envío gratis a partir de" type="number"
                  value={s.freeShippingOverCents ? String(s.freeShippingOverCents / 100) : ''}
                  onChange={(v) => setS({ ...s, freeShippingOverCents: v ? Math.round(Number(v) * 100) : null })}
                  prefix="RD$" autoComplete="off" helpText="Déjalo vacío para desactivarlo." />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Ubicación</Text>
                <Checkbox label="Permitir «Usar mi ubicación actual»" checked={l.gpsEnabled}
                  onChange={(v) => setL({ ...l, gpsEnabled: v })} />
                <Checkbox label="Permitir escribir la dirección" checked={l.manualEnabled}
                  onChange={(v) => setL({ ...l, manualEnabled: v })} />
                <Checkbox label="Bloquear el mapa tras capturar la ubicación" checked={l.lockAfterCapture}
                  onChange={(v) => setL({ ...l, lockAfterCapture: v })}
                  helpText="Recomendado: evita que el cliente mueva el pin sin querer al hacer scroll." />
                <TextField label="Texto del botón de ubicación" value={l.gpsLabel}
                  onChange={(v) => setL({ ...l, gpsLabel: v })} autoComplete="off" />
                <TextField label="Texto del botón de escritura" value={l.manualLabel}
                  onChange={(v) => setL({ ...l, manualLabel: v })} autoComplete="off" />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Anti-fraude</Text>

                <Checkbox
                  label="Retener pedidos de riesgo alto para revisión manual"
                  checked={s.antifraud.holdHighRisk}
                  onChange={(v) => setS({ ...s, antifraud: { ...s.antifraud, holdHighRisk: v } })}
                  helpText="Los pedidos sospechosos no se envían a Shopify hasta que tú los apruebes en Pedidos → En revisión."
                />
                {s.antifraud.holdHighRisk && (
                  <TextField
                    label="Umbral de riesgo (0-100)"
                    type="number"
                    value={String(s.antifraud.riskThreshold)}
                    onChange={(v) => setS({ ...s, antifraud: { ...s.antifraud, riskThreshold: Number(v) } })}
                    autoComplete="off"
                    helpText="A partir de este puntaje, el pedido se retiene. 50 es un buen punto de partida."
                  />
                )}
                <TextField
                  label="Máximo de pedidos por teléfono al día"
                  type="number"
                  value={String(s.antifraud.maxOrdersPerPhonePerDay)}
                  onChange={(v) => setS({ ...s, antifraud: { ...s.antifraud, maxOrdersPerPhonePerDay: Number(v) } })}
                  autoComplete="off"
                  helpText="0 = sin límite. Frena a quien hace muchos pedidos falsos con el mismo número."
                />

                <Text as="h3" variant="headingSm">CAPTCHA (Cloudflare Turnstile)</Text>
                <TextField
                  label="Site Key"
                  value={s.antifraud.turnstileSiteKey}
                  onChange={(v) => setS({ ...s, antifraud: { ...s.antifraud, turnstileSiteKey: v } })}
                  autoComplete="off"
                  helpText="Opcional. Déjalo vacío para desactivar el CAPTCHA."
                />
                <TextField
                  label="Secret Key"
                  value={s.antifraud.turnstileSecret}
                  onChange={(v) => setS({ ...s, antifraud: { ...s.antifraud, turnstileSecret: v } })}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Tracking / píxeles</Text>
                <Banner tone="info">
                  <p>
                    El evento de compra se envía por servidor (CAPI) y por navegador con el mismo ID,
                    así Meta lo cuenta una sola vez. El token del CAPI vive en el servidor: nunca sale
                    al navegador.
                  </p>
                </Banner>

                <Text as="h3" variant="headingSm">Meta (Facebook / Instagram)</Text>
                <TextField label="Pixel ID" value={s.tracking.metaPixelId}
                  onChange={(v) => setS({ ...s, tracking: { ...s.tracking, metaPixelId: v } })}
                  autoComplete="off" />
                <TextField label="Token de Conversions API" value={s.tracking.metaCapiToken}
                  onChange={(v) => setS({ ...s, tracking: { ...s.tracking, metaCapiToken: v } })}
                  autoComplete="off" type="password"
                  helpText="Events Manager → Configuración → Conversions API → Generar token." />
                <TextField label="Test event code (opcional)" value={s.tracking.metaTestCode}
                  onChange={(v) => setS({ ...s, tracking: { ...s.tracking, metaTestCode: v } })}
                  autoComplete="off" helpText="Para verificar en «Probar eventos» del Events Manager." />

                <Text as="h3" variant="headingSm">TikTok</Text>
                <TextField label="Pixel ID" value={s.tracking.tiktokPixelId}
                  onChange={(v) => setS({ ...s, tracking: { ...s.tracking, tiktokPixelId: v } })}
                  autoComplete="off" />
                <TextField label="Access Token" value={s.tracking.tiktokToken}
                  onChange={(v) => setS({ ...s, tracking: { ...s.tracking, tiktokToken: v } })}
                  autoComplete="off" type="password" />

                <Text as="h3" variant="headingSm">Google Analytics 4</Text>
                <TextField label="Measurement ID" value={s.tracking.ga4MeasurementId}
                  onChange={(v) => setS({ ...s, tracking: { ...s.tracking, ga4MeasurementId: v } })}
                  autoComplete="off" placeholder="G-XXXXXXXXXX" />
                <TextField label="API Secret" value={s.tracking.ga4ApiSecret}
                  onChange={(v) => setS({ ...s, tracking: { ...s.tracking, ga4ApiSecret: v } })}
                  autoComplete="off" type="password" />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {fetcher.data?.message && <Toast content={fetcher.data.message} onDismiss={() => {}} />}
      </Page>
    </Frame>
  );
}
