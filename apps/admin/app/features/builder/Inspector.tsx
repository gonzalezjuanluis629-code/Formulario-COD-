import {
  BlockStack, Box, Button, Card, Checkbox, Divider, InlineStack, Select, Text, TextField,
} from '@shopify/polaris';
import type { Field } from '@cod/contracts';

const WIDTHS = [
  { label: '25 %', value: '25' }, { label: '33 %', value: '33' }, { label: '50 %', value: '50' },
  { label: '66 %', value: '66' }, { label: '75 %', value: '75' }, { label: '100 %', value: '100' },
];

const OPS = [
  { label: 'es igual a', value: 'eq' }, { label: 'no es igual a', value: 'neq' },
  { label: 'contiene', value: 'contains' }, { label: 'está vacío', value: 'empty' },
  { label: 'no está vacío', value: 'notEmpty' },
  { label: 'mayor que', value: 'gt' }, { label: 'menor que', value: 'lt' },
];

const NO_INPUT = ['heading', 'subheading', 'divider', 'html', 'image', 'video'];
const HAS_OPTIONS = ['select', 'radio', 'multiselect'];

/** Panel derecho: todo lo configurable de UN campo. */
export function Inspector({
  field, allFields, onChange,
}: {
  field: Field | null;
  allFields: Field[];
  onChange: (f: Field) => void;
}) {
  if (!field) {
    return (
      <Card padding="400">
        <Text as="p" tone="subdued" alignment="center">
          Selecciona un bloque para configurarlo.
        </Text>
      </Card>
    );
  }

  const set = <K extends keyof Field>(k: K, v: Field[K]) => onChange({ ...field, [k]: v });
  const isContent = NO_INPUT.includes(field.type);

  return (
    <Card padding="400">
      <BlockStack gap="400">
        <Text as="h3" variant="headingSm">Configurar bloque</Text>

        {isContent ? (
          <TextField
            label="Contenido"
            value={field.content}
            onChange={(v) => set('content', v)}
            multiline={field.type === 'html' ? 4 : 2}
            autoComplete="off"
            helpText={field.type === 'html' ? 'Se inserta tal cual. Úsalo con cuidado.' : undefined}
          />
        ) : (
          <>
            <TextField label="Etiqueta" value={field.label}
              onChange={(v) => set('label', v)} autoComplete="off" />
            <TextField label="Placeholder" value={field.placeholder}
              onChange={(v) => set('placeholder', v)} autoComplete="off" />
            <TextField label="Texto de ayuda" value={field.help}
              onChange={(v) => set('help', v)} autoComplete="off" />
            <TextField
              label="Nombre interno (key)" value={field.key}
              onChange={(v) => set('key', v.replace(/[^a-zA-Z0-9_]/g, ''))}
              autoComplete="off"
              helpText="Con este nombre llega el dato al pedido. Cámbialo solo si sabes lo que haces."
            />
          </>
        )}

        <InlineStack gap="300" wrap={false}>
          <div style={{ flex: 1 }}>
            <Select label="Ancho" options={WIDTHS} value={field.width}
              onChange={(v) => set('width', v as Field['width'])} />
          </div>
        </InlineStack>

        {!isContent && (
          <InlineStack gap="400">
            <Checkbox label="Obligatorio" checked={field.required}
              onChange={(v) => set('required', v)} />
            <Checkbox label="Visible" checked={field.visible}
              onChange={(v) => set('visible', v)} />
          </InlineStack>
        )}

        {/* ── Opciones (listas) ── */}
        {HAS_OPTIONS.includes(field.type) && (
          <>
            <Divider />
            <BlockStack gap="200">
              <Text as="h4" variant="headingXs">Opciones</Text>
              {field.options.map((o, i) => (
                <InlineStack key={i} gap="200" wrap={false} blockAlign="center">
                  <div style={{ flex: 1 }}>
                    <TextField labelHidden label="Etiqueta" value={o.label} autoComplete="off"
                      onChange={(v) => {
                        const opts = [...field.options];
                        opts[i] = { label: v, value: v.toLowerCase().replace(/\s+/g, '-') };
                        set('options', opts);
                      }} />
                  </div>
                  <Button size="micro" tone="critical" variant="tertiary"
                    onClick={() => set('options', field.options.filter((_, j) => j !== i))}>✕</Button>
                </InlineStack>
              ))}
              <Button size="slim"
                onClick={() => set('options', [...field.options,
                  { label: `Opción ${field.options.length + 1}`, value: `opcion-${field.options.length + 1}` }])}>
                Añadir opción
              </Button>
            </BlockStack>
          </>
        )}

        {/* ── Validaciones ── */}
        {!isContent && (
          <>
            <Divider />
            <BlockStack gap="200">
              <Text as="h4" variant="headingXs">Validación</Text>
              <InlineStack gap="200" wrap={false}>
                <TextField label="Mínimo" type="number" autoComplete="off"
                  value={field.validation.minLength?.toString() ?? ''}
                  onChange={(v) => set('validation', {
                    ...field.validation, minLength: v ? Number(v) : null })} />
                <TextField label="Máximo" type="number" autoComplete="off"
                  value={field.validation.maxLength?.toString() ?? ''}
                  onChange={(v) => set('validation', {
                    ...field.validation, maxLength: v ? Number(v) : null })} />
              </InlineStack>
              <TextField label="Expresión regular" autoComplete="off"
                value={field.validation.regex ?? ''}
                onChange={(v) => set('validation', { ...field.validation, regex: v || null })}
                helpText="Opcional. Ej: ^[0-9]{5}$" />
              <TextField label="Mensaje de error" autoComplete="off"
                value={field.validation.message ?? ''}
                onChange={(v) => set('validation', { ...field.validation, message: v || null })} />
            </BlockStack>
          </>
        )}

        {/* ── Reglas condicionales ── */}
        <Divider />
        <BlockStack gap="200">
          <Text as="h4" variant="headingXs">Mostrar solo si…</Text>
          <Box>
            <Text as="p" variant="bodySm" tone="subdued">
              Si añades varias reglas, deben cumplirse TODAS.
            </Text>
          </Box>

          {field.conditions.map((c, i) => (
            <InlineStack key={i} gap="150" wrap={false} blockAlign="center">
              <div style={{ flex: 1 }}>
                <Select labelHidden label="Campo" value={c.field}
                  options={allFields
                    .filter((f) => f.key !== field.key && !NO_INPUT.includes(f.type))
                    .map((f) => ({ label: f.label || f.key, value: f.key }))}
                  onChange={(v) => {
                    const cs = [...field.conditions];
                    cs[i] = { ...c, field: v };
                    set('conditions', cs);
                  }} />
              </div>
              <div style={{ width: 130 }}>
                <Select labelHidden label="Operador" options={OPS} value={c.op}
                  onChange={(v) => {
                    const cs = [...field.conditions];
                    cs[i] = { ...c, op: v as typeof c.op };
                    set('conditions', cs);
                  }} />
              </div>
              {!['empty', 'notEmpty'].includes(c.op) && (
                <div style={{ width: 110 }}>
                  <TextField labelHidden label="Valor" autoComplete="off"
                    value={String(c.value ?? '')}
                    onChange={(v) => {
                      const cs = [...field.conditions];
                      cs[i] = { ...c, value: v };
                      set('conditions', cs);
                    }} />
                </div>
              )}
              <Button size="micro" variant="tertiary" tone="critical"
                onClick={() => set('conditions', field.conditions.filter((_, j) => j !== i))}>✕</Button>
            </InlineStack>
          ))}

          <Button size="slim"
            onClick={() => set('conditions', [...field.conditions,
              { field: allFields.find((f) => f.key !== field.key)?.key ?? '', op: 'eq', value: '' }])}>
            Añadir regla
          </Button>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
