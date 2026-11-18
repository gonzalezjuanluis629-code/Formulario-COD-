import { useState } from 'react';
import {
  BlockStack, Box, Button, ButtonGroup, Checkbox, Collapsible, Divider, Icon, InlineStack, Select, Text, TextField,
} from '@shopify/polaris';
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, DeleteIcon, PlusIcon } from '@shopify/polaris-icons';
import type { Field, ThemeTokens } from '@cod/contracts';
import { Color } from './DesignPanel';
import { CONTENT_TYPES, FIELD_META, OPTION_TYPES } from './fieldMeta';
import { IconPicker } from '../../components/IconPicker';

const TEXT_TYPES: Field['type'][] = ['heading', 'subheading', 'richtext'];
const LOOK_COLORS = ['', '#111111', '#475467', '#16a34a', '#2563eb', '#dc2626', '#ea580c', '#7c3aed', '#db2777'];

/** Icono, color, alineación y tamaño del texto (títulos, párrafos y título de los campos). */
function LookEditor({ field, onChange }: { field: Field; onChange: (f: Field) => void }) {
  const look = field.look ?? { icon: '', color: '', align: 'left' as const, size: 'md' as const };
  const set = (p: Partial<typeof look>) => onChange({ ...field, look: { ...look, ...p } });
  const isText = TEXT_TYPES.includes(field.type);
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingSm">{isText ? 'Aspecto del texto' : 'Aspecto del título del campo'}</Text>
      <BlockStack gap="150">
        <Text as="span" variant="bodyMd">Icono</Text>
        <IconPicker label="Icono del texto" value={look.icon} onChange={(n) => set({ icon: n })} />
      </BlockStack>
      <BlockStack gap="150">
        <Text as="span" variant="bodyMd">Color</Text>
        <div className="cod-lookcolors" role="radiogroup" aria-label="Color del texto">
          <style dangerouslySetInnerHTML={{ __html: '.cod-lookcolors{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.cod-lookcolors button,.cod-lookcolors label{width:34px;height:34px;border-radius:50%;border:3px solid var(--p-color-bg-surface,#fff);box-shadow:0 0 0 1px var(--p-color-border,#D0D5DD);cursor:pointer;position:relative;display:grid;place-items:center;font:600 10px/1 Inter,sans-serif;color:var(--p-color-text-secondary,#667085);background:var(--p-color-bg-surface,#fff)}.cod-lookcolors button.on{box-shadow:0 0 0 3px #1A73E8}.cod-lookcolors label input{position:absolute;inset:0;opacity:0;cursor:pointer}' }} />
          {LOOK_COLORS.map((c) => (
            <button key={c || 'auto'} type="button" role="radio" aria-checked={look.color === c} aria-label={c || 'Automático'}
              className={look.color === c ? 'on' : ''} style={c ? { background: c } : undefined} onClick={() => set({ color: c })}>{c ? '' : 'Auto'}</button>
          ))}
          <label title="Otro color" style={look.color && !LOOK_COLORS.includes(look.color) ? { background: look.color } : undefined}>
            <input type="color" aria-label="Otro color" value={/^#[0-9a-f]{6}$/i.test(look.color) ? look.color : '#111111'} onChange={(e) => set({ color: e.target.value })} />+
          </label>
        </div>
      </BlockStack>
      <BlockStack gap="150">
        <Text as="span" variant="bodyMd">Alineación</Text>
        <ButtonGroup variant="segmented" fullWidth>
          {([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']] as const).map(([v, l]) => (
            <Button key={v} pressed={look.align === v} onClick={() => set({ align: v })}>{l}</Button>
          ))}
        </ButtonGroup>
      </BlockStack>
      {isText && (
        <BlockStack gap="150">
          <Text as="span" variant="bodyMd">Tamaño</Text>
          <ButtonGroup variant="segmented" fullWidth>
            {([['sm', 'Pequeño'], ['md', 'Normal'], ['lg', 'Grande']] as const).map(([v, l]) => (
              <Button key={v} pressed={look.size === v} onClick={() => set({ size: v })}>{l}</Button>
            ))}
          </ButtonGroup>
        </BlockStack>
      )}
    </BlockStack>
  );
}

const OPS = [
  { label: 'es igual a', value: 'eq' }, { label: 'no es igual a', value: 'neq' },
  { label: 'contiene', value: 'contains' }, { label: 'está vacío', value: 'empty' },
  { label: 'no está vacío', value: 'notEmpty' },
  { label: 'mayor que', value: 'gt' }, { label: 'menor que', value: 'lt' },
];

/** Campos que el formulario añade solos y se pueden usar en reglas. */
const VIRTUAL_FIELDS = [{ label: 'Modo de dirección (gps / manual)', value: 'locationMode' }];

/** Editor de UN campo. Lo esencial arriba; lo técnico en «Más opciones». */
export function FieldSettings({
  field, allFields, onChange, onBack, onRemove, onMove, onGoDesign, tokens, onTokens,
}: {
  /** Diseño del formulario: para cambiar aquí mismo el color del botón «Aplicar». */
  tokens?: ThemeTokens;
  onTokens?: (t: ThemeTokens) => void;
  field: Field;
  allFields: Field[];
  onChange: (f: Field) => void;
  onBack: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onGoDesign?: () => void;
}) {
  const [more, setMore] = useState(false);
  const meta = FIELD_META[field.type];
  const isContent = CONTENT_TYPES.includes(field.type);
  const set = <K extends keyof Field>(k: K, v: Field[K]) => onChange({ ...field, [k]: v });
  const sorted = [...allFields].sort((a, b) => a.order - b.order);
  const pos = sorted.findIndex((f) => f.key === field.key);

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center" wrap={false}>
        <Button variant="tertiary" icon={ArrowLeftIcon} onClick={onBack}>Campos</Button>
        <InlineStack gap="150" blockAlign="center">
          <Icon source={meta?.icon} tone="subdued" />
          <Text as="span" variant="bodySm" tone="subdued">{meta?.label}</Text>
        </InlineStack>
      </InlineStack>

      {/* ── Contenido (títulos, párrafos, imágenes…) ── */}
      {isContent && field.type !== 'divider' && (
        <TextField
          label={
            field.type === 'image' ? 'Enlace (URL) de la imagen'
              : field.type === 'video' ? 'Enlace del video'
                : field.type === 'html' ? 'Código HTML' : 'Texto'
          }
          value={field.content}
          onChange={(v) => set('content', v)}
          multiline={field.type === 'richtext' || field.type === 'html' ? 4 : undefined}
          autoComplete="off"
          helpText={
            field.type === 'image' ? 'Sube la imagen en Contenido → Archivos de Shopify y pega aquí su enlace.'
              : field.type === 'video' ? 'Un enlace de YouTube, Vimeo o un archivo .mp4.'
                : field.type === 'html' ? 'Se inserta tal cual. Úsalo solo si sabes HTML.' : undefined
          }
        />
      )}
      {field.type === 'divider' && (
        <Text as="p" tone="subdued">Una línea para separar secciones del formulario. No tiene opciones.</Text>
      )}
      {TEXT_TYPES.includes(field.type) && <LookEditor field={field} onChange={onChange} />}

      {/* ── Campos que piden datos ── */}
      {!isContent && (
        <>
          <TextField label="Pregunta o título del campo" value={field.label}
            onChange={(v) => set('label', v)} autoComplete="off"
            placeholder={field.type === 'checkbox' ? 'Opcional' : 'Ej. Nombre completo'} />

          {field.type === 'discount' && (
            <TextField label="Texto del botón" value={field.content}
              onChange={(v) => set('content', v)} autoComplete="off" placeholder="Aplicar"
              helpText="Valida el código en tus descuentos de Shopify y en los creados en «Ofertas y descuentos»." />
          )}
          {field.type === 'discount' && tokens && onTokens ? (
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Botón «Aplicar»</Text>
              <Color label="Color del botón" value={tokens.applyBg} onChange={(v) => onTokens({ ...tokens, applyBg: v })} />
              <Color label="Color de la letra" value={tokens.applyColor} onChange={(v) => onTokens({ ...tokens, applyColor: v })} />
            </BlockStack>
          ) : field.type === 'discount' && onGoDesign ? (
            <Button onClick={onGoDesign}>Cambiar color del botón</Button>
          ) : null}

          {field.type === 'checkbox' && (
            <TextField label="Texto junto a la casilla" value={field.content}
              onChange={(v) => set('content', v)} autoComplete="off" multiline={2} />
          )}

          {!['checkbox', 'radio', 'multiselect', 'location'].includes(field.type) && (
            <TextField label="Texto de ejemplo dentro del campo" value={field.placeholder}
              onChange={(v) => set('placeholder', v)} autoComplete="off"
              helpText="Se ve en gris y desaparece al escribir." />
          )}

          <Checkbox label="Obligatorio" checked={field.required}
            onChange={(v) => set('required', v)}
            helpText="El cliente no puede enviar el pedido sin rellenarlo." />
          {field.label && field.type !== 'location' && <LookEditor field={field} onChange={onChange} />}
        </>
      )}

      {/* ── Opciones de las listas ── */}
      {OPTION_TYPES.includes(field.type) && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">Opciones</Text>
          {field.options.map((o, i) => (
            <InlineStack key={i} gap="200" wrap={false} blockAlign="center">
              <div style={{ flex: 1 }}>
                <TextField labelHidden label={`Opción ${i + 1}`} value={o.label} autoComplete="off"
                  onChange={(v) => {
                    const opts = [...field.options];
                    opts[i] = { label: v, value: v.trim().toLowerCase().replace(/\s+/g, '-') || `opcion-${i + 1}` };
                    set('options', opts);
                  }} />
              </div>
              <Button variant="tertiary" tone="critical" icon={DeleteIcon} accessibilityLabel="Quitar opción"
                disabled={field.options.length <= 1}
                onClick={() => set('options', field.options.filter((_, j) => j !== i))} />
            </InlineStack>
          ))}
          <Button icon={PlusIcon} onClick={() => set('options', [...field.options,
            { label: `Opción ${field.options.length + 1}`, value: `opcion-${field.options.length + 1}` }])}>
            Añadir opción
          </Button>
        </BlockStack>
      )}

      {/* ── Ancho ── */}
      {field.type !== 'divider' && (
        <BlockStack gap="150">
          <Text as="span" variant="bodyMd">Ancho</Text>
          <ButtonGroup variant="segmented" fullWidth>
            {([['100', 'Completo'], ['50', 'Mitad'], ['33', 'Un tercio']] as const).map(([w, l]) => (
              <Button key={w} pressed={field.width === w} onClick={() => set('width', w)}>{l}</Button>
            ))}
          </ButtonGroup>
          <Text as="span" variant="bodySm" tone="subdued">Dos campos a «Mitad» seguidos quedan en la misma fila.</Text>
        </BlockStack>
      )}

      <Divider />

      <Button variant="plain" disclosure={more ? 'up' : 'down'} onClick={() => setMore((v) => !v)}>
        Más opciones
      </Button>

      <Collapsible open={more} id={`more-${field.key}`}>
        <BlockStack gap="400">
          {!isContent && (
            <TextField label="Texto de ayuda (debajo del campo)" value={field.help}
              onChange={(v) => set('help', v)} autoComplete="off" />
          )}

          <Checkbox label="Mostrar este campo" checked={field.visible}
            onChange={(v) => set('visible', v)}
            helpText="Desmárcalo para ocultarlo sin borrarlo." />

          {!isContent && !OPTION_TYPES.includes(field.type) && !['checkbox', 'location', 'discount'].includes(field.type) && (
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Validación</Text>
              <InlineStack gap="200" wrap={false}>
                <TextField label="Mín. caracteres" type="number" autoComplete="off"
                  value={field.validation.minLength?.toString() ?? ''}
                  onChange={(v) => set('validation', { ...field.validation, minLength: v ? Number(v) : null })} />
                <TextField label="Máx. caracteres" type="number" autoComplete="off"
                  value={field.validation.maxLength?.toString() ?? ''}
                  onChange={(v) => set('validation', { ...field.validation, maxLength: v ? Number(v) : null })} />
              </InlineStack>
              <TextField label="Mensaje si está mal" autoComplete="off"
                value={field.validation.message ?? ''}
                onChange={(v) => set('validation', { ...field.validation, message: v || null })} />
            </BlockStack>
          )}

          {/* Reglas: mostrar solo si… */}
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Mostrar solo si…</Text>
            {field.conditions.length === 0 && (
              <Text as="p" variant="bodySm" tone="subdued">Sin reglas: se muestra siempre.</Text>
            )}
            {field.conditions.map((c, i) => {
              const options = [
                ...allFields
                  .filter((f) => f.key !== field.key && !CONTENT_TYPES.includes(f.type))
                  .map((f) => ({ label: f.label || f.content || f.key, value: f.key })),
                ...VIRTUAL_FIELDS,
              ];
              const upd = (patch: Partial<typeof c>) => {
                const cs = [...field.conditions]; cs[i] = { ...c, ...patch }; set('conditions', cs);
              };
              return (
                <Box key={i} padding="200" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="150">
                    <Select labelHidden label="Campo" value={c.field} options={options} onChange={(v) => upd({ field: v })} />
                    <InlineStack gap="150" wrap={false} blockAlign="center">
                      <div style={{ flex: 1 }}>
                        <Select labelHidden label="Condición" options={OPS} value={c.op}
                          onChange={(v) => upd({ op: v as typeof c.op })} />
                      </div>
                      {!['empty', 'notEmpty'].includes(c.op) && (
                        <div style={{ flex: 1 }}>
                          <TextField labelHidden label="Valor" autoComplete="off" value={String(c.value ?? '')}
                            onChange={(v) => upd({ value: v })} />
                        </div>
                      )}
                      <Button variant="tertiary" tone="critical" icon={DeleteIcon} accessibilityLabel="Quitar regla"
                        onClick={() => set('conditions', field.conditions.filter((_, j) => j !== i))} />
                    </InlineStack>
                  </BlockStack>
                </Box>
              );
            })}
            <Button icon={PlusIcon} onClick={() => set('conditions', [...field.conditions,
              { field: allFields.find((f) => f.key !== field.key)?.key ?? 'locationMode', op: 'eq', value: '' }])}>
              Añadir regla
            </Button>
          </BlockStack>

          {!isContent && (
            <TextField label="Nombre interno" value={field.key}
              onChange={(v) => set('key', v.replace(/[^a-zA-Z0-9_]/g, ''))} autoComplete="off"
              helpText="Con este nombre llega el dato al pedido. Cámbialo solo si sabes lo que haces." />
          )}
        </BlockStack>
      </Collapsible>

      <Divider />
      <InlineStack gap="200" align="space-between" blockAlign="center">
        <ButtonGroup>
          <Button icon={ArrowUpIcon} disabled={pos <= 0} onClick={() => onMove(-1)}>Subir</Button>
          <Button icon={ArrowDownIcon} disabled={pos < 0 || pos >= sorted.length - 1} onClick={() => onMove(1)}>Bajar</Button>
        </ButtonGroup>
        <Button tone="critical" variant="plain" icon={DeleteIcon} onClick={onRemove}>Eliminar</Button>
      </InlineStack>
    </BlockStack>
  );
}
