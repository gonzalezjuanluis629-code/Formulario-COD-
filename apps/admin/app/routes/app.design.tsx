import { useState } from 'react';
import {
  BlockStack, Button, Card, Checkbox, Divider, Frame, InlineStack, Layout, Page,
  RangeSlider, Select, Text, TextField, Toast,
} from '@shopify/polaris';
import type { TriggerButton, SubmitButton } from '@cod/contracts';
import { useFetcher, useLoaderData } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { ThemeTokensSchema, type ThemeTokens } from '@cod/contracts';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';
import { Preview } from '../features/builder/Preview';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const theme = await db.theme.findFirstOrThrow({ where: { shopId: shop.id, isDefault: true } });
  const form = await db.form.findFirst({
    where: { shopId: shop.id, status: 'ACTIVE' },
    include: { versions: true },
  });
  const current = form?.versions.find((v) => v.id === form.currentVersionId);
  return {
    themeId: theme.id,
    tokens: ThemeTokensSchema.parse(theme.tokens ?? {}),
    fields: (current?.schema ?? []) as never[],
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const tokens = ThemeTokensSchema.parse(JSON.parse(String(fd.get('tokens'))));

  await db.theme.updateMany({
    where: { id: String(fd.get('themeId')), shopId: shop.id },
    data: { tokens: tokens as object },
  });
  // El widget cachea la config 60 s: el cambio se ve en la tienda en menos de un minuto.
  return { ok: true, message: 'Diseño guardado. Se aplica en tu tienda en menos de 1 minuto.' };
}

export default function Design() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ message: string }>();
  const [t, setT] = useState<ThemeTokens>(data.tokens);

  const set = <K extends keyof ThemeTokens>(k: K, v: ThemeTokens[K]) => setT({ ...t, [k]: v });
  const setTrigger = (patch: Partial<TriggerButton>) => setT({ ...t, trigger: { ...t.trigger, ...patch } });
  const setSubmit = (patch: Partial<SubmitButton>) => setT({ ...t, submit: { ...t.submit, ...patch } });

  return (
    <Frame>
      <Page
        title="Diseño"
        subtitle="Todo lo que cambies aquí se aplica al formulario sin tocar código."
        primaryAction={{
          content: 'Guardar',
          loading: fetcher.state !== 'idle',
          onAction: () =>
            fetcher.submit({ themeId: data.themeId, tokens: JSON.stringify(t) }, { method: 'post' }),
        }}
      >
        <Layout>
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Colores</Text>
                  <Color label="Principal (botón)" value={t.brand} onChange={(v) => set('brand', v)} />
                  <Color label="Éxito" value={t.success} onChange={(v) => set('success', v)} />
                  <Color label="Error" value={t.danger} onChange={(v) => set('danger', v)} />
                  <Color label="Fondo" value={t.surface} onChange={(v) => set('surface', v)} />
                  <Color label="Campos" value={t.field} onChange={(v) => set('field', v)} />
                  <Color label="Bordes" value={t.border} onChange={(v) => set('border', v)} />
                  <Color label="Barra de progreso" value={t.progressColor} onChange={(v) => set('progressColor', v)} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Tipografía y formas</Text>
                  <Select
                    label="Fuente"
                    options={[
                      { label: 'La del tema (sistema)', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' },
                      { label: 'Inter', value: 'Inter, sans-serif' },
                      { label: 'Poppins', value: 'Poppins, sans-serif' },
                      { label: 'Montserrat', value: 'Montserrat, sans-serif' },
                    ]}
                    value={t.fontFamily}
                    onChange={(v) => set('fontFamily', v)}
                  />
                  <RangeSlider label={`Tamaño de texto: ${t.fontSize} px`} min={12} max={18} step={0.5}
                    value={t.fontSize} onChange={(v) => set('fontSize', v as number)} />
                  <RangeSlider label={`Redondeo de campos: ${t.radius} px`} min={0} max={24}
                    value={t.radius} onChange={(v) => set('radius', v as number)} />
                  <RangeSlider label={`Redondeo del botón: ${t.buttonRadius} px`} min={0} max={30}
                    value={t.buttonRadius} onChange={(v) => set('buttonRadius', v as number)} />
                  <RangeSlider label={`Alto del botón: ${t.buttonHeight} px`} min={38} max={64}
                    value={t.buttonHeight} onChange={(v) => set('buttonHeight', v as number)} />
                  <Select label="Sombra" value={t.shadow}
                    options={[
                      { label: 'Ninguna', value: 'none' }, { label: 'Suave', value: 'sm' },
                      { label: 'Media', value: 'md' }, { label: 'Fuerte', value: 'lg' },
                    ]}
                    onChange={(v) => set('shadow', v as ThemeTokens['shadow'])} />
                  <Select label="Espaciado" value={t.spacing}
                    options={[
                      { label: 'Compacto', value: 'compact' }, { label: 'Normal', value: 'normal' },
                      { label: 'Amplio', value: 'relaxed' },
                    ]}
                    onChange={(v) => set('spacing', v as ThemeTokens['spacing'])} />
                </BlockStack>
              </Card>

              {/* ── Botón "Comprar ahora" (abre el formulario) ── */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Botón «Comprar ahora»</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    El que abre el formulario cuando lo pones en modo popup.
                  </Text>

                  <TextField label="Título" value={t.trigger.text}
                    onChange={(v) => setTrigger({ text: v })} autoComplete="off" />

                  <InlineStack gap="200" wrap={false}>
                    <TextField label="Ancho" value={t.trigger.width}
                      onChange={(v) => setTrigger({ width: v })} autoComplete="off"
                      helpText="auto, 100% o px" />
                    <div style={{ flex: 1 }}>
                      <RangeSlider label={`Alto: ${t.trigger.height} px`} min={36} max={96}
                        value={t.trigger.height} onChange={(v) => setTrigger({ height: v as number })} />
                    </div>
                  </InlineStack>

                  <RangeSlider label={`Tamaño del título: ${t.trigger.fontSize} px`} min={12} max={28}
                    value={t.trigger.fontSize} onChange={(v) => setTrigger({ fontSize: v as number })} />
                  <RangeSlider label={`Tamaño de la descripción: ${t.trigger.descriptionFontSize} px`} min={9} max={18}
                    value={t.trigger.descriptionFontSize}
                    onChange={(v) => setTrigger({ descriptionFontSize: v as number })} />

                  <InlineStack gap="200">
                    <Color label="Fondo" value={t.trigger.bg} onChange={(v) => setTrigger({ bg: v })} />
                    <Color label="Texto" value={t.trigger.color} onChange={(v) => setTrigger({ color: v })} />
                  </InlineStack>
                  <RangeSlider label={`Redondeo: ${t.trigger.radius} px`} min={0} max={60}
                    value={t.trigger.radius} onChange={(v) => setTrigger({ radius: v as number })} />

                  <Select label="Icono" value={t.trigger.iconType}
                    options={[
                      { label: 'Sin icono', value: 'none' },
                      { label: 'Emoji / carácter', value: 'emoji' },
                      { label: 'Imagen propia', value: 'image' },
                    ]}
                    onChange={(v) => setTrigger({ iconType: v as 'none' | 'emoji' | 'image' })} />
                  {t.trigger.iconType === 'emoji' && (
                    <TextField label="Emoji" value={t.trigger.icon}
                      onChange={(v) => setTrigger({ icon: v })} autoComplete="off" />
                  )}
                  {t.trigger.iconType === 'image' && (
                    <TextField label="URL de la imagen" value={t.trigger.iconImageUrl ?? ''}
                      onChange={(v) => setTrigger({ iconImageUrl: v || null })} autoComplete="off"
                      helpText="Sube la imagen a Archivos de Shopify y pega su URL." />
                  )}

                  <Select label="Animación" value={t.trigger.animation}
                    options={[
                      { label: 'Ninguna', value: 'none' }, { label: 'Latido', value: 'pulse' },
                      { label: 'Brillo', value: 'shine' }, { label: 'Rebote', value: 'bounce' },
                    ]}
                    onChange={(v) => setTrigger({ animation: v as never })} />

                  <Divider />
                  <Text as="h4" variant="headingXs">Descripciones rotativas (máx. 5)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Rotan bajo el título: «Envío gratis» → «Pago contra entrega» → …
                  </Text>
                  {t.trigger.descriptions.map((d, i) => (
                    <InlineStack key={i} gap="200" wrap={false} blockAlign="center">
                      <div style={{ flex: 1 }}>
                        <TextField labelHidden label={`Descripción ${i + 1}`} value={d} autoComplete="off"
                          onChange={(v) => {
                            const arr = [...t.trigger.descriptions]; arr[i] = v;
                            setTrigger({ descriptions: arr });
                          }} />
                      </div>
                      <Button variant="tertiary" tone="critical"
                        onClick={() => setTrigger({ descriptions: t.trigger.descriptions.filter((_, j) => j !== i) })}>
                        ✕
                      </Button>
                    </InlineStack>
                  ))}
                  {t.trigger.descriptions.length < 5 && (
                    <Button size="slim"
                      onClick={() => setTrigger({ descriptions: [...t.trigger.descriptions, ''] })}>
                      Añadir descripción
                    </Button>
                  )}
                  <RangeSlider label={`Cambian cada: ${(t.trigger.descriptionIntervalMs / 1000).toFixed(1)} s`}
                    min={1000} max={8000} step={500} value={t.trigger.descriptionIntervalMs}
                    onChange={(v) => setTrigger({ descriptionIntervalMs: v as number })} />
                </BlockStack>
              </Card>

              {/* ── Botón "Finalizar pedido" (envía) ── */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Botón «Finalizar pedido»</Text>
                  <TextField label="Texto" value={t.submit.text}
                    onChange={(v) => setSubmit({ text: v })} autoComplete="off" />
                  <RangeSlider label={`Alto: ${t.submit.height} px`} min={38} max={72}
                    value={t.submit.height} onChange={(v) => setSubmit({ height: v as number })} />
                  <RangeSlider label={`Tamaño de texto: ${t.submit.fontSize} px`} min={12} max={24}
                    value={t.submit.fontSize} onChange={(v) => setSubmit({ fontSize: v as number })} />
                  <RangeSlider label={`Redondeo: ${t.submit.radius} px`} min={0} max={40}
                    value={t.submit.radius} onChange={(v) => setSubmit({ radius: v as number })} />
                  <InlineStack gap="200">
                    <Color label="Fondo" value={t.submit.bg} onChange={(v) => setSubmit({ bg: v })} />
                    <Color label="Texto" value={t.submit.color} onChange={(v) => setSubmit({ color: v })} />
                  </InlineStack>
                  <Color label="Color al completarse" value={t.submit.readyBg}
                    onChange={(v) => setSubmit({ readyBg: v })} />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Cuando el formulario está completo, el botón cambia a este color.
                  </Text>
                  <Select label="Icono" value={t.submit.iconType}
                    options={[{ label: 'Sin icono', value: 'none' }, { label: 'Emoji / flecha', value: 'emoji' }]}
                    onChange={(v) => setSubmit({ iconType: v as 'none' | 'emoji' })} />
                  {t.submit.iconType === 'emoji' && (
                    <TextField label="Icono" value={t.submit.icon}
                      onChange={(v) => setSubmit({ icon: v })} autoComplete="off" />
                  )}
                  <Select label="Animación" value={t.submit.animation}
                    options={[
                      { label: 'Ninguna', value: 'none' }, { label: 'Latido (al completarse)', value: 'pulse' },
                      { label: 'Brillo', value: 'shine' },
                    ]}
                    onChange={(v) => setSubmit({ animation: v as never })} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Extras</Text>
                  <TextField label="URL del logo" value={t.logoUrl ?? ''}
                    onChange={(v) => set('logoUrl', v || null)} autoComplete="off" />
                  <Checkbox label="Animaciones del formulario" checked={t.animations}
                    onChange={(v) => set('animations', v)}
                    helpText="Desactívalas si el formulario se siente lento en móviles antiguos." />
                  <Checkbox label="Barra de progreso" checked={t.progressBar}
                    onChange={(v) => set('progressBar', v)} />
                  <TextField label="CSS personalizado" value={t.customCss}
                    onChange={(v) => set('customCss', v)} multiline={5} autoComplete="off"
                    helpText="Se inyecta dentro del Shadow DOM: no puede romper tu tema." />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            <Preview fields={data.fields} tokens={t} />
          </Layout.Section>
        </Layout>

        {fetcher.data?.message && <Toast content={fetcher.data.message} onDismiss={() => {}} />}
      </Page>
    </Frame>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <InlineStack gap="200" blockAlign="center" wrap={false}>
      <input
        type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 34, height: 34, border: '1px solid #e1e3e5', borderRadius: 6, padding: 0, cursor: 'pointer' }}
        aria-label={label}
      />
      <div style={{ flex: 1 }}>
        <TextField labelHidden label={label} value={value} onChange={onChange} autoComplete="off" prefix={label} />
      </div>
    </InlineStack>
  );
}
