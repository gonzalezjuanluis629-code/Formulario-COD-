import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Banner, BlockStack, Button, Frame, InlineStack, Page, Select, Tabs, Text, TextField, Toast,
} from '@shopify/polaris';
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { AddonSchema, FieldSchema, OfferSchema, ThemeTokensSchema, type Field, type ThemeTokens } from '@cod/contracts';
import { requireShop } from '../lib/shop.server';
import { pickResources, useBase } from '../lib/base';
import { db } from '../db.server';
import { FieldList } from '../features/builder/FieldList';
import { FieldSettings } from '../features/builder/FieldSettings';
import { DesignPanel, type DesignSection } from '../features/builder/DesignPanel';
import { Preview } from '../features/builder/Preview';

/** El diseño que usa el formulario: el suyo o, si no tiene, el de la tienda. */
async function themeFor(shopId: string, themeId: string | null) {
  if (themeId) {
    const own = await db.theme.findFirst({ where: { id: themeId, shopId } });
    if (own) return own;
  }
  return (await db.theme.findFirst({ where: { shopId, isDefault: true } }))
    ?? db.theme.create({ data: { shopId, name: 'Tema por defecto', isDefault: true, tokens: {} } });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);

  const form = await db.form.findFirstOrThrow({
    where: { id: params.id!, shopId: shop.id }, // el shopId sale de la sesión, nunca de la URL
    include: { versions: { orderBy: { version: 'desc' } }, assignments: true },
  });
  const current = form.versions.find((v) => v.id === form.currentVersionId) ?? form.versions[0]!;
  const theme = await themeFor(shop.id, form.themeId);
  // Ofertas y extras activos, para que la vista previa muestre el formulario completo.
  const offerRows = await db.offer.findMany({ where: { shopId: shop.id, active: true }, orderBy: { priority: 'desc' } });
  const offers = offerRows.filter((r) => r.type === 'QUANTITY')
    .map((r) => OfferSchema.safeParse({ id: r.id, label: r.name, type: 'QUANTITY', ...(r.payload as object) }))
    .flatMap((r) => (r.success ? [r.data] : []));
  const addons = offerRows.filter((r) => r.type !== 'QUANTITY')
    .map((r) => AddonSchema.safeParse({ id: r.id, ...(r.payload as object) }))
    .flatMap((r) => (r.success ? [r.data] : []));

  return {
    form: {
      id: form.id, name: form.name, status: form.status, displayMode: form.displayMode,
      assignment: form.assignments[0]
        ? { type: form.assignments[0].type, value: form.assignments[0].value ?? '', label: form.assignments[0].label ?? '' }
        : null,
    },
    fields: current.schema as Field[],
    themeId: theme.id,
    tokens: ThemeTokensSchema.parse(theme.tokens ?? {}),
    offers, addons,
    versions: form.versions.map((v) => ({ id: v.id, version: v.version, publishedAt: v.publishedAt })),
    currentVersion: current.version,
  };
}

type ActionResult = { ok: boolean; message: string };

export async function action({ request, params }: ActionFunctionArgs): Promise<ActionResult | null> {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const intent = String(fd.get('intent'));
  const form = await db.form.findFirstOrThrow({ where: { id: params.id!, shopId: shop.id } });

  if (intent === 'save' || intent === 'publish') {
    const parsed = FieldSchema.array().safeParse(JSON.parse(String(fd.get('fields') || '[]')));
    if (!parsed.success) return { ok: false, message: 'Hay un campo con datos no válidos. Revísalo e inténtalo de nuevo.' };
    const fields = parsed.data;

    const keys = new Set<string>();
    for (const f of fields) {
      if (keys.has(f.key)) return { ok: false, message: `Hay dos campos con el mismo nombre interno «${f.key}». Cambia uno en «Más opciones».` };
      keys.add(f.key);
    }

    // Dónde se muestra.
    const type = String(fd.get('assignType') || 'ALL') as 'ALL' | 'PRODUCT' | 'COLLECTION' | 'TAG' | 'VENDOR';
    const value = String(fd.get('assignValue') || '') || null;
    const label = String(fd.get('assignLabel') || '') || null;
    if (type !== 'ALL' && !value) {
      return { ok: false, message: 'Elige el producto, la colección, la etiqueta o el proveedor donde se muestra.' };
    }
    const priority = { PRODUCT: 5, COLLECTION: 4, TAG: 3, VENDOR: 2, ALL: 1 }[type];
    await db.formAssignment.deleteMany({ where: { formId: form.id } });
    await db.formAssignment.create({
      data: { formId: form.id, type, value: type === 'ALL' ? null : value, label, priority },
    });

    // Diseño.
    if (fd.get('tokens')) {
      const tokens = ThemeTokensSchema.safeParse(JSON.parse(String(fd.get('tokens'))));
      if (!tokens.success) return { ok: false, message: 'Algún valor del diseño no es válido.' };
      const theme = await themeFor(shop.id, form.themeId);
      await db.theme.update({ where: { id: theme.id }, data: { tokens: tokens.data as object } });
      if (form.themeId !== theme.id) await db.form.update({ where: { id: form.id }, data: { themeId: theme.id } });
    }

    const name = String(fd.get('name') || '').trim() || form.name;
    const displayMode = fd.get('displayMode') === 'POPUP' ? 'POPUP' : 'EMBEDDED';
    if (form.displayMode !== displayMode) await db.form.update({ where: { id: form.id }, data: { displayMode } });

    if (intent === 'publish') {
      // Publicar crea una VERSIÓN NUEVA: lo que está en la tienda no se rompe y se puede volver atrás.
      const last = await db.formVersion.findFirst({ where: { formId: form.id }, orderBy: { version: 'desc' } });
      const version = await db.formVersion.create({
        data: { formId: form.id, version: (last?.version ?? 0) + 1, schema: fields as object, publishedAt: new Date() },
      });
      await db.form.update({ where: { id: form.id }, data: { currentVersionId: version.id, status: 'ACTIVE', name } });
      return { ok: true, message: 'Publicado. Ya está en tu tienda (puede tardar 1 minuto).' };
    }

    await db.formVersion.update({ where: { id: form.currentVersionId! }, data: { schema: fields as object } });
    await db.form.update({ where: { id: form.id }, data: { name } });
    return { ok: true, message: 'Cambios guardados.' };
  }

  if (intent === 'revert') {
    const target = await db.formVersion.findFirst({ where: { id: String(fd.get('versionId')), formId: form.id } });
    if (!target) return { ok: false, message: 'Esa versión ya no existe.' };
    await db.form.update({ where: { id: form.id }, data: { currentVersionId: target.id } });
    return { ok: true, message: `Restaurada la versión ${target.version}.` };
  }

  if (intent === 'toggle') {
    await db.form.update({ where: { id: form.id }, data: { status: form.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } });
    return { ok: true, message: form.status === 'ACTIVE' ? 'Formulario pausado: ya no se ve en la tienda.' : 'Formulario activado.' };
  }

  return null;
}

type Tab = 'fields' | 'design' | 'settings';
const TABS: { id: Tab; content: string }[] = [
  { id: 'fields', content: 'Campos' },
  { id: 'design', content: 'Diseño' },
  { id: 'settings', content: 'Ajustes' },
];

export default function FormEditor() {
  const navigate = useNavigate();
  const base = useBase();
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const [params] = useSearchParams();

  const [tab, setTab] = useState<Tab>(params.get('tab') === 'design' ? 'design' : 'fields');
  const [name, setName] = useState(data.form.name);
  const [fields, setFields] = useState<Field[]>(data.fields);
  const [tokens, setTokens] = useState<ThemeTokens>(data.tokens);
  const [selected, setSelected] = useState<string | null>(null);
  const [designOpen, setDesignOpen] = useState<DesignSection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [displayMode, setDisplayMode] = useState<'EMBEDDED' | 'POPUP'>(data.form.displayMode === 'POPUP' ? 'POPUP' : 'EMBEDDED');
  const [assignType, setAssignType] = useState(data.form.assignment?.type ?? 'ALL');
  const [assignValue, setAssignValue] = useState(data.form.assignment?.value ?? '');
  const [assignLabel, setAssignLabel] = useState(data.form.assignment?.label ?? '');

  const selectedField = useMemo(() => fields.find((f) => f.key === selected) ?? null, [fields, selected]);
  const busy = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.ok) { setToast(fetcher.data.message); setDirty(false); }
    }
  }, [fetcher.state, fetcher.data]);

  const changeFields = useCallback((f: Field[]) => { setFields(f); setDirty(true); }, []);
  const changeField = useCallback((f: Field) => {
    setFields((prev) => prev.map((x) => (x.key === selected ? f : x)));
    if (f.key !== selected) setSelected(f.key);
    setDirty(true);
  }, [selected]);
  const changeTokens = useCallback((t: ThemeTokens) => { setTokens(t); setDirty(true); }, []);

  const selectFromPreview = useCallback((key: string) => {
    setTab('fields');
    setSelected(key);
  }, []);

  const pickResource = useCallback(async (type: 'PRODUCT' | 'COLLECTION') => {
    const picked = await pickResources({ type: type === 'PRODUCT' ? 'product' : 'collection' });
    if (picked?.length) { setAssignValue(picked[0].id); setAssignLabel(picked[0].title); setDirty(true); }
  }, []);

  const send = async (intent: string, extra: Record<string, string> = {}) => {
    // Token de sesión fresco: el de la URL caduca al minuto.
    const actionUrl = new URL(window.location.href);
    const shopify = (window as unknown as { shopify?: { idToken?: () => Promise<string> } }).shopify;
    if (shopify?.idToken) actionUrl.searchParams.set('id_token', await shopify.idToken());
    fetcher.submit(
      {
        intent, name, fields: JSON.stringify(fields), tokens: JSON.stringify(tokens),
        assignType, assignValue, assignLabel, displayMode, ...extra,
      },
      { method: 'post', action: `${actionUrl.pathname}${actionUrl.search}` },
    );
  };

  const status = data.form.status;

  return (
    <Frame>
      <style>{EDITOR_CSS}</style>
      <Page
        fullWidth
        backAction={{ content: 'Formularios', onAction: () => navigate(base === '/figui' ? '/figui?lista=1' : '/app/forms') }}
        title={name || 'Formulario'}
        titleMetadata={
          <InlineStack gap="200">
            <Badge tone={status === 'ACTIVE' ? 'success' : status === 'PAUSED' ? 'warning' : undefined}>
              {status === 'ACTIVE' ? 'Publicado' : status === 'PAUSED' ? 'Pausado' : 'Sin publicar'}
            </Badge>
            {dirty && <Badge tone="attention">Cambios sin guardar</Badge>}
          </InlineStack>
        }
        primaryAction={{ content: 'Publicar', loading: busy, disabled: !fields.length, onAction: () => send('publish') }}
        secondaryActions={[
          { content: 'Guardar', disabled: busy || !dirty, onAction: () => send('save') },
          ...(status !== 'DRAFT'
            ? [{ content: status === 'ACTIVE' ? 'Pausar' : 'Activar', disabled: busy, onAction: () => send('toggle') }]
            : []),
        ]}
      >
        {fetcher.data && !fetcher.data.ok && fetcher.state === 'idle' && (
          <div style={{ marginBottom: 12 }}>
            <Banner tone="critical" title="No se pudo guardar">{fetcher.data.message}</Banner>
          </div>
        )}

        <div className="cod-editor">
          {/* ── Panel izquierdo ── */}
          <div className="cod-editor-side">
            <div className="cod-editor-tabs">
              <Tabs tabs={TABS} selected={TABS.findIndex((t) => t.id === tab)}
                onSelect={(i) => { setTab(TABS[i]!.id); if (TABS[i]!.id !== 'fields') setSelected(null); }} fitted />
            </div>
            <div className="cod-editor-body">
              {tab === 'fields' && (selectedField ? (
                <FieldSettings
                  key={selectedField.key}
                  field={selectedField}
                  allFields={fields}
                  onChange={changeField}
                  onBack={() => setSelected(null)}
                  onGoDesign={() => { setSelected(null); setTab('design'); setDesignOpen('colors'); }}
                  onMove={(dir) => {
                    const list = [...fields].sort((a, b) => a.order - b.order);
                    const i = list.findIndex((f) => f.key === selectedField.key);
                    const j = i + dir;
                    if (i < 0 || j < 0 || j >= list.length) return;
                    [list[i], list[j]] = [list[j]!, list[i]!];
                    changeFields(list.map((f, n) => ({ ...f, order: n + 1 })));
                  }}
                  onRemove={() => {
                    changeFields(fields.filter((f) => f.key !== selectedField.key).map((f, i) => ({ ...f, order: i + 1 })));
                    setSelected(null);
                  }}
                />
              ) : (
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Toca un campo para editarlo. Para cambiar el orden, arrastra su tarjeta hacia arriba o hacia abajo.
                  </Text>
                  <FieldList fields={fields} onChange={changeFields} onSelect={setSelected} />
                </BlockStack>
              ))}

              {tab === 'design' && (
                <DesignPanel tokens={tokens} onChange={changeTokens} open={designOpen} onOpen={setDesignOpen} />
              )}

              {tab === 'settings' && (
                <BlockStack gap="400">
                  <TextField label="Nombre del formulario" value={name} autoComplete="off"
                    helpText="Solo lo ves tú, para reconocerlo."
                    onChange={(v) => { setName(v); setDirty(true); }} />
                  <Select
                    label="¿Cómo se muestra en la tienda?"
                    options={[
                      { label: 'Formulario completo en la página del producto', value: 'EMBEDDED' },
                      { label: 'Botón «Comprar ahora» que abre el formulario en una ventana', value: 'POPUP' },
                    ]}
                    value={displayMode}
                    onChange={(v) => { setDisplayMode(v as 'EMBEDDED' | 'POPUP'); setDirty(true); }}
                    helpText={displayMode === 'POPUP' ? 'El diseño del botón se cambia en Diseño → Botón «Comprar ahora».' : undefined}
                  />
                  <Select
                    label="¿En qué productos se muestra?"
                    options={[
                      { label: 'En todos los productos', value: 'ALL' },
                      { label: 'Solo en un producto', value: 'PRODUCT' },
                      { label: 'En una colección', value: 'COLLECTION' },
                      { label: 'En productos con una etiqueta', value: 'TAG' },
                      { label: 'En productos de un proveedor', value: 'VENDOR' },
                    ]}
                    value={assignType}
                    onChange={(v) => { setAssignType(v as typeof assignType); setAssignValue(''); setAssignLabel(''); setDirty(true); }}
                  />
                  {(assignType === 'PRODUCT' || assignType === 'COLLECTION') && (
                    <Button onClick={() => pickResource(assignType)}>
                      {assignLabel || `Elegir ${assignType === 'PRODUCT' ? 'producto' : 'colección'}…`}
                    </Button>
                  )}
                  {(assignType === 'TAG' || assignType === 'VENDOR') && (
                    <TextField label={assignType === 'TAG' ? 'Etiqueta' : 'Proveedor'} value={assignValue} autoComplete="off"
                      placeholder={assignType === 'TAG' ? 'Ej. contraentrega' : 'Ej. Mi marca'}
                      onChange={(v) => { setAssignValue(v); setDirty(true); }} />
                  )}

                  {data.versions.length > 1 && (
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Versiones publicadas</Text>
                      {data.versions.slice(0, 5).map((v) => (
                        <InlineStack key={v.id} align="space-between" blockAlign="center">
                          <Text as="span" variant="bodySm">
                            Versión {v.version}{v.version === data.currentVersion ? ' · en uso' : ''}
                            {v.publishedAt ? ` · ${new Date(v.publishedAt).toLocaleDateString('es')}` : ''}
                          </Text>
                          {v.version !== data.currentVersion && (
                            <Button size="slim" onClick={() => send('revert', { versionId: v.id })}>Restaurar</Button>
                          )}
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              )}
            </div>
          </div>

          {/* ── Vista previa, siempre visible ── */}
          <div className="cod-editor-preview">
            <Preview
              fields={fields}
              tokens={tokens}
              selectedKey={tab === 'fields' ? selected : null}
              onSelect={selectFromPreview}
              showTrigger={displayMode === 'POPUP' || (tab === 'design' && designOpen === 'trigger')}
              offers={data.offers}
              addons={data.addons}
            />
          </div>
        </div>

        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}

const EDITOR_CSS = `
.cod-editor{display:grid;grid-template-columns:minmax(320px,400px) 1fr;gap:16px;align-items:start}
.cod-editor-side{background:var(--p-color-bg-surface);border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,.07),0 0 0 1px rgba(0,0,0,.06);
  display:flex;flex-direction:column;height:calc(100vh - 130px);min-height:520px;overflow:hidden}
.cod-editor-tabs{border-bottom:1px solid var(--p-color-border-secondary);flex-shrink:0}
.cod-editor-body{padding:14px;overflow:auto;flex:1}
.cod-editor-preview{position:sticky;top:var(--cod-sticky-top,12px);height:calc(100vh - 130px);min-height:520px;border-radius:12px;overflow:hidden;
  box-shadow:0 1px 0 rgba(0,0,0,.07),0 0 0 1px rgba(0,0,0,.06);background:var(--p-color-bg)}
@media (max-width: 860px){
  .cod-editor{grid-template-columns:minmax(0,1fr)}
  .cod-editor-side,.cod-editor-preview{min-width:0}
  .cod-editor-side{height:auto;min-height:0}
  .cod-editor-body{overflow:visible}
  .cod-editor-preview{position:relative;top:0;height:640px}
}`;
