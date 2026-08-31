import { useState } from 'react';
import {
  Badge, BlockStack, Button, Card, EmptyState, IndexTable, InlineStack, Modal, Page, Select, Text, TextField,
} from '@shopify/polaris';
import { Form, useLoaderData, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import * as crypto from 'node:crypto';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';

/** Mismo hash que la API: HMAC-SHA256 + pepper. Así el bloqueo casa con el submit. */
function hash(value: string): string {
  return crypto.createHmac('sha256', process.env.PII_HASH_PEPPER!)
    .update(value.trim().toLowerCase()).digest('hex');
}
/** El teléfono se normaliza a E.164 antes de hashear (como en el submit). */
function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('1') && d.length === 11 ? d.slice(1) : d;
  return local.length === 10 ? `+1${local}` : raw.trim();
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const entries = await db.blocklistEntry.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
  });
  return { entries };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const fd = await request.formData();
  const intent = String(fd.get('intent'));

  if (intent === 'add') {
    const type = String(fd.get('type')) as 'PHONE' | 'IP' | 'EMAIL' | 'PROVINCE';
    const raw = String(fd.get('value')).trim();
    if (!raw) return null;

    // El label es legible; el valueHash es lo que se compara sin exponer PII.
    const normalized = type === 'PHONE' ? normalizePhone(raw) : raw;
    const valueHash = type === 'PROVINCE' ? normalized : hash(normalized);

    await db.blocklistEntry.upsert({
      where: { shopId_type_valueHash: { shopId: shop.id, type, valueHash } },
      update: { label: raw, reason: String(fd.get('reason') || '') },
      create: { shopId: shop.id, type, valueHash, label: raw, reason: String(fd.get('reason') || '') },
    });
  }

  if (intent === 'remove') {
    await db.blocklistEntry.deleteMany({ where: { id: String(fd.get('id')), shopId: shop.id } });
  }
  return null;
}

const LABELS: Record<string, string> = {
  PHONE: 'Teléfono', IP: 'IP', EMAIL: 'Correo', PROVINCE: 'Provincia',
};

export default function Blocklist() {
  const { entries } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [open, setOpen] = useState(false);

  return (
    <Page
      title="Lista de bloqueo"
      subtitle="Pedidos desde estos teléfonos, IPs o correos se rechazan automáticamente."
      primaryAction={{ content: 'Bloquear', onAction: () => setOpen(true) }}
    >
      <Card padding="0">
        {entries.length === 0 ? (
          <EmptyState heading="Nada bloqueado todavía" image="">
            <p>Añade un teléfono, IP o correo para rechazar sus pedidos.</p>
          </EmptyState>
        ) : (
          <IndexTable
            itemCount={entries.length}
            selectable={false}
            headings={[{ title: 'Tipo' }, { title: 'Valor' }, { title: 'Motivo' }, { title: '' }]}
          >
            {entries.map((e, i) => (
              <IndexTable.Row id={e.id} key={e.id} position={i}>
                <IndexTable.Cell><Badge>{LABELS[e.type] ?? e.type}</Badge></IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{e.label ?? '—'}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{e.reason || '—'}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Form method="post">
                    <input type="hidden" name="id" value={e.id} />
                    <Button size="micro" tone="critical" variant="tertiary" name="intent" value="remove" submit>
                      Quitar
                    </Button>
                  </Form>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      <AddModal open={open} onClose={() => setOpen(false)} submit={submit} />
    </Page>
  );
}

function AddModal({ open, onClose, submit }: { open: boolean; onClose: () => void; submit: ReturnType<typeof useSubmit> }) {
  const [type, setType] = useState('PHONE');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  return (
    <Modal
      open={open} onClose={onClose} title="Bloquear"
      primaryAction={{
        content: 'Bloquear',
        onAction: () => { submit({ intent: 'add', type, value, reason }, { method: 'post' }); onClose(); },
        disabled: !value.trim(),
      }}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Select label="Tipo" value={type} onChange={setType}
            options={[
              { label: 'Teléfono', value: 'PHONE' },
              { label: 'Dirección IP', value: 'IP' },
              { label: 'Correo', value: 'EMAIL' },
              { label: 'Provincia (código DO-XX)', value: 'PROVINCE' },
            ]} />
          <TextField label="Valor" value={value} onChange={setValue} autoComplete="off"
            placeholder={type === 'PHONE' ? '809 555 1234' : type === 'PROVINCE' ? 'DO-05' : ''} />
          <TextField label="Motivo (opcional)" value={reason} onChange={setReason} autoComplete="off" />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
