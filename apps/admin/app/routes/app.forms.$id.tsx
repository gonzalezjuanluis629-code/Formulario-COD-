import { useCallback, useMemo, useState } from 'react';
import {
  Badge, BlockStack, Button, Card, InlineStack, Layout, Page, Select, Text, TextField, Toast, Frame,
} from '@shopify/polaris';
import { useFetcher, useLoaderData, useNavigate } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { FieldSchema, ThemeTokensSchema, type Field, type ThemeTokens } from '@cod/contracts';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';
import { FormBuilder } from '../features/builder/FormBuilder';
import { Inspector } from '../features/builder/Inspector';
import { Preview } from '../features/builder/Preview';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);

  const form = await db.form.findFirstOrThrow({
    where: { id: params.id!, shopId: shop.id }, // el shopId sale de la sesión, nunca de la URL
    include: { versions: { orderBy: { version: 'desc' } }, theme: true, assignments: true },
  });

  const current = form.versions.find((v) => v.id === form.currentVersionId) ?? form.versions[0]!;

  return {
    form: {
      id: form.id, name: form.name, status: form.status, displayMode: form.displayMode,
      assignment: form.assignments[0]
        ? { type: form.assignments[0].type, value: form.assignments[0].value ?? '', label: (form.assignments[0] as { label?: string }).label ?? '' }
        : null,
    },
    fields: current.schema as Field[],
    tokens: ThemeTokensSchema.parse(form.theme?.tokens ?? {}),
    versions: form.versions.map((v) => ({ id: v.id, version: v.version, publishedAt: v.publishedAt })),
    currentVersion: current.version,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const intent = String(fd.get('intent'));

  const form = await db.form.findFirstOrThrow({ where: { id: params.id!, shopId: shop.id } });

  /* La asignación (dónde se muestra) se guarda en publish y en save. */
  if (intent === 'publish' || intent === 'save') {
    const type = String(fd.get('assignType') || 'ALL') as
      'ALL' | 'PRODUCT' | 'COLLECTION' | 'TAG' | 'VENDOR';
    const value = String(fd.get('assignValue') || '') || null;
    const label = String(fd.get('assignLabel') || '') || null;

    // Especificidad como prioridad, para que producto gane a colección, etc.
    const priority = { PRODUCT: 5, COLLECTION: 4, TAG: 3, VENDOR: 2, ALL: 1 }[type];

    await db.formAssignment.deleteMany({ where: { formId: form.id } });
    await db.formAssignment.create({
      data: { formId: form.id, type, value: type === 'ALL' ? null : value, label, priority },
    });
  }

  /* ── Publicar: crea una VERSIÓN NUEVA, no pisa la anterior. ──
     Así el formulario que está vivo en la tienda no se rompe a medio editar,
     y siempre se puede volver atrás. */
  if (intent === 'publish') {
    const fields = FieldSchema.array().parse(JSON.parse(String(fd.get('fields'))));

    // Reglas que el builder no puede dejar pasar al storefront.
    const keys = new Set<string>();
    for (const f of fields) {
      if (keys.has(f.key)) throw new Response(`Hay dos campos con la clave "${f.key}"`, { status: 400 });
      keys.add(f.key);
    }

    const last = await db.formVersion.findFirst({
      where: { formId: form.id }, orderBy: { version: 'desc' },
    });

    const version = await db.formVersion.create({
      data: {
        formId: form.id,
        version: (last?.version ?? 0) + 1,
        schema: fields as object,
        publishedAt: new Date(),
      },
    });

    await db.form.update({
      where: { id: form.id },
      data: { currentVersionId: version.id, status: 'ACTIVE', name: String(fd.get('name') || form.name) },
    });

    return { ok: true, message: `Publicado (v${version.version}). Ya está en tu tienda.` };
  }

  /* ── Guardar borrador: sobrescribe la versión actual SI no está publicada. ── */
  if (intent === 'save') {
    const fields = FieldSchema.array().parse(JSON.parse(String(fd.get('fields'))));
    await db.formVersion.update({
      where: { id: form.currentVersionId! },
      data: { schema: fields as object },
    });
    await db.form.update({ where: { id: form.id }, data: { name: String(fd.get('name') || form.name) } });
    return { ok: true, message: 'Borrador guardado.' };
  }

  /* ── Revertir a una versión anterior. ── */
  if (intent === 'revert') {
    const versionId = String(fd.get('versionId'));
    const target = await db.formVersion.findFirstOrThrow({ where: { id: versionId, formId: form.id } });
    await db.form.update({ where: { id: form.id }, data: { currentVersionId: target.id } });
    return { ok: true, message: `Revertido a la versión ${target.version}.` };
  }

  if (intent === 'toggle') {
    await db.form.update({
      where: { id: form.id },
      data: { status: form.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' },
    });
    return { ok: true, message: 'Estado actualizado.' };
  }

  /* ── Exportar / importar (JSON portable entre tiendas). ── */
  if (intent === 'import') {
    const fields = FieldSchema.array().parse(JSON.parse(String(fd.get('json'))));
    await db.formVersion.update({
      where: { id: form.currentVersionId! },
      data: { schema: fields as object },
    });
    return { ok: true, message: 'Formulario importado.' };
  }

  return null;
}

export default function FormEditor() {
  const navigate = useNavigate();
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();

  const [name, setName] = useState(data.form.name);
  const [fields, setFields] = useState<Field[]>(data.fields);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Asignación: dónde se muestra el formulario.
  const [assignType, setAssignType] = useState(data.form.assignment?.type ?? 'ALL');
  const [assignValue, setAssignValue] = useState(data.form.assignment?.value ?? '');
  const [assignLabel, setAssignLabel] = useState(data.form.assignment?.label ?? '');

  const selectedField = useMemo(
    () => fields.find((f) => f.key === selected) ?? null,
    [fields, selected],
  );

  /** Resource Picker de App Bridge: elegir producto o colección sin pegar IDs. */
  const pickResource = useCallback(async (type: 'PRODUCT' | 'COLLECTION') => {
    const shopify = (window as unknown as { shopify?: { resourcePicker: (o: unknown) => Promise<unknown> } }).shopify;
    if (!shopify?.resourcePicker) return;
    const picked = (await shopify.resourcePicker({
      type: type === 'PRODUCT' ? 'product' : 'collection',
      action: 'select',
    })) as { id: string; title: string }[] | undefined;
    if (picked?.length) {
      setAssignValue(picked[0].id);
      setAssignLabel(picked[0].title);
      setDirty(true);
    }
  }, []);

  const updateFields = useCallback((f: Field[]) => {
    setFields(f);
    setDirty(true);
  }, []);

  const updateField = useCallback((f: Field) => {
    setFields((prev) => prev.map((x) => (x.key === selected ? f : x)));
    if (f.key !== selected) setSelected(f.key); // si cambió la key, seguirla
    setDirty(true);
  }, [selected]);

  const send = async (intent: string, extra: Record<string, string> = {}) => {
    // React Router conserva los query params de la carga inicial, incluido un
    // id_token que caduca al minuto. Al guardar después de editar, Shopify
    // rechazaba ese token antiguo con 400. Sustituirlo justo antes del submit
    // mantiene autenticadas todas las acciones del editor.
    const actionUrl = new URL(window.location.href);
    const shopify = (window as unknown as {
      shopify?: { idToken?: () => Promise<string> };
    }).shopify;
    if (shopify?.idToken) {
      actionUrl.searchParams.set('id_token', await shopify.idToken());
    }

    fetcher.submit(
      {
        intent, name, fields: JSON.stringify(fields),
        assignType, assignValue, assignLabel,
        ...extra,
      },
      { method: 'post', action: `${actionUrl.pathname}${actionUrl.search}` },
    );
    setDirty(false);
  };

  const busy = fetcher.state !== 'idle';

  return (
    <Frame>
      <Page
        backAction={{ content: 'Formularios', onAction: () => navigate('/app/forms') }}
        title={name}
        titleMetadata={
          <InlineStack gap="200">
            <Badge tone={data.form.status === 'ACTIVE' ? 'success' : undefined}>
              {data.form.status === 'ACTIVE' ? 'Activo' : data.form.status === 'PAUSED' ? 'Pausado' : 'Borrador'}
            </Badge>
            <Badge>{`v${data.currentVersion}`}</Badge>
            {dirty && <Badge tone="attention">Sin guardar</Badge>}
          </InlineStack>
        }
        primaryAction={{
          content: 'Publicar',
          loading: busy,
          disabled: !fields.length,
          onAction: () => send('publish'),
        }}
        secondaryActions={[
          { content: 'Guardar borrador', onAction: () => send('save'), disabled: busy },
          {
            content: data.form.status === 'ACTIVE' ? 'Pausar' : 'Activar',
            onAction: () => send('toggle'),
          },
          {
            content: 'Exportar JSON',
            onAction: () => {
              const blob = new Blob([JSON.stringify(fields, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`;
              a.click();
            },
          },
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card padding="300">
              <InlineStack gap="300" blockAlign="end" wrap={false}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Nombre del formulario"
                    value={name}
                    onChange={(v) => { setName(v); setDirty(true); }}
                    autoComplete="off"
                  />
                </div>
                <div style={{ width: 300 }}>
                  <BlockStack gap="150">
                    <Select
                      label="Se muestra en"
                      options={[
                        { label: 'Todos los productos', value: 'ALL' },
                        { label: 'Un producto específico', value: 'PRODUCT' },
                        { label: 'Una colección', value: 'COLLECTION' },
                        { label: 'Por etiqueta', value: 'TAG' },
                        { label: 'Por proveedor', value: 'VENDOR' },
                      ]}
                      value={assignType}
                      onChange={(v) => { setAssignType(v); setAssignValue(''); setAssignLabel(''); setDirty(true); }}
                    />

                    {(assignType === 'PRODUCT' || assignType === 'COLLECTION') && (
                      <Button
                        onClick={() => pickResource(assignType)}
                        variant="secondary"
                      >
                        {assignLabel || `Elegir ${assignType === 'PRODUCT' ? 'producto' : 'colección'}…`}
                      </Button>
                    )}
                    {(assignType === 'TAG' || assignType === 'VENDOR') && (
                      <TextField
                        label={assignType === 'TAG' ? 'Etiqueta' : 'Proveedor'}
                        labelHidden
                        value={assignValue}
                        onChange={(v) => { setAssignValue(v); setDirty(true); }}
                        autoComplete="off"
                        placeholder={assignType === 'TAG' ? 'Ej. oferta' : 'Ej. Nike'}
                      />
                    )}
                  </BlockStack>
                </div>
              </InlineStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <FormBuilder
              fields={fields}
              onChange={updateFields}
              selectedKey={selected}
              onSelect={setSelected}
            />
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Inspector field={selectedField} allFields={fields} onChange={updateField} />

              {data.versions.length > 1 && (
                <Card padding="300">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Historial</Text>
                    {data.versions.slice(0, 5).map((v) => (
                      <InlineStack key={v.id} align="space-between" blockAlign="center">
                        <Text as="span" variant="bodySm">
                          v{v.version}
                          {v.version === data.currentVersion ? ' · en uso' : ''}
                        </Text>
                        {v.version !== data.currentVersion && (
                          <Button size="micro" onClick={() => send('revert', { versionId: v.id })}>
                            Restaurar
                          </Button>
                        )}
                      </InlineStack>
                    ))}
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            <Preview fields={fields} tokens={data.tokens as ThemeTokens} />
          </Layout.Section>
        </Layout>

        {fetcher.data?.message && <Toast content={fetcher.data.message} onDismiss={() => {}} />}
      </Page>
    </Frame>
  );
}
