import { Badge, Button, Card, EmptyState, IndexTable, Page, Text } from '@shopify/polaris';
import { Form, useLoaderData, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';
import { DEFAULT_FIELDS } from '../lib/defaults';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const forms = await db.form.findMany({
    where: { shopId: shop.id, status: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { submissions: true } }, versions: { select: { version: true } } },
  });
  return { forms };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const intent = fd.get('intent');

  if (intent === 'create') {
    const theme = await db.theme.findFirst({ where: { shopId: shop.id, isDefault: true } });
    const form = await db.form.create({
      data: {
        shopId: shop.id, name: 'Formulario sin título', status: 'DRAFT', themeId: theme?.id,
        assignments: { create: { type: 'ALL', priority: 0 } },
      },
    });
    const v = await db.formVersion.create({
      data: { formId: form.id, version: 1, schema: DEFAULT_FIELDS },
    });
    await db.form.update({ where: { id: form.id }, data: { currentVersionId: v.id } });
    return redirect(`/app/forms/${form.id}`);
  }

  if (intent === 'duplicate') {
    const id = String(fd.get('id'));
    const src = await db.form.findFirstOrThrow({
      where: { id, shopId: shop.id },
      include: { versions: true, assignments: true },
    });
    const current = src.versions.find((v) => v.id === src.currentVersionId) ?? src.versions.at(-1)!;

    const copy = await db.form.create({
      data: {
        shopId: shop.id, name: `${src.name} (copia)`, status: 'DRAFT',
        themeId: src.themeId, displayMode: src.displayMode,
        assignments: { create: src.assignments.map((a) => ({ type: a.type, value: a.value, priority: a.priority })) },
      },
    });
    const v = await db.formVersion.create({
      data: { formId: copy.id, version: 1, schema: current.schema as object, rules: current.rules as object },
    });
    await db.form.update({ where: { id: copy.id }, data: { currentVersionId: v.id } });
    return redirect(`/app/forms/${copy.id}`);
  }

  if (intent === 'archive') {
    await db.form.updateMany({
      where: { id: String(fd.get('id')), shopId: shop.id },
      data: { status: 'ARCHIVED' },
    });
  }
  return null;
}

export default function FormsList() {
  const { forms } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  if (!forms.length) {
    return (
      <Page title="Formularios">
        <Card>
          <EmptyState
            heading="Crea tu primer formulario"
            action={{ content: 'Crear formulario', onAction: () => submit({ intent: 'create' }, { method: 'post' }) }}
            image=""
          >
            <p>Diseña el formulario contra entrega y publícalo en tu tienda.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Formularios"
      primaryAction={{
        content: 'Crear formulario',
        onAction: () => submit({ intent: 'create' }, { method: 'post' }),
      }}
    >
      <Card padding="0">
        <IndexTable
          itemCount={forms.length}
          selectable={false}
          headings={[{ title: 'Nombre' }, { title: 'Estado' }, { title: 'Versión' }, { title: 'Pedidos' }, { title: '' }]}
        >
          {forms.map((f, i) => (
            <IndexTable.Row id={f.id} key={f.id} position={i}>
              <IndexTable.Cell>
                <a href={`/app/forms/${f.id}`} style={{ fontWeight: 600 }}>{f.name}</a>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Badge tone={f.status === 'ACTIVE' ? 'success' : f.status === 'PAUSED' ? 'warning' : undefined}>
                  {f.status === 'ACTIVE' ? 'Activo' : f.status === 'PAUSED' ? 'Pausado' : 'Borrador'}
                </Badge>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" tone="subdued">v{f.versions.length}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>{f._count.submissions}</IndexTable.Cell>
              <IndexTable.Cell>
                <Form method="post" style={{ display: 'flex', gap: 6 }}>
                  <input type="hidden" name="id" value={f.id} />
                  <Button size="micro" name="intent" value="duplicate" submit>Duplicar</Button>
                  <Button size="micro" tone="critical" variant="tertiary" name="intent" value="archive" submit>
                    Archivar
                  </Button>
                </Form>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
