import { useCallback, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Badge, BlockStack, Box, Button, Card, InlineStack, Text, Tooltip,
} from '@shopify/polaris';
import type { Field } from '@cod/contracts';
import { PALETTE, newField } from '../../lib/defaults';

/**
 * Constructor drag & drop.
 *
 * Dos decisiones de diseño:
 * 1. El estado vive AQUÍ, en memoria, y solo se persiste al pulsar "Publicar".
 *    Así el merchant puede trastear sin miedo: nada llega al storefront hasta
 *    que publica, y publicar crea una FormVersion nueva (se puede revertir).
 * 2. El campo `location` es único por formulario. Dos mapas en un mismo
 *    formulario no tienen sentido y romperían el autocompletado.
 */
export function FormBuilder({
  fields,
  onChange,
  selectedKey,
  onSelect,
}: {
  fields: Field[];
  onChange: (f: Field[]) => void;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [dragging, setDragging] = useState<Field | null>(null);

  // 6 px de tolerancia: sin esto, un clic para seleccionar se interpreta como arrastre.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const sorted = useMemo(() => [...fields].sort((a, b) => a.order - b.order), [fields]);
  const hasLocation = fields.some((f) => f.type === 'location');

  const handleStart = (e: DragStartEvent) => {
    setDragging(sorted.find((f) => f.key === e.active.id) ?? null);
  };

  const handleEnd = useCallback(
    (e: DragEndEvent) => {
      setDragging(null);
      const { active, over } = e;
      if (!over || active.id === over.id) return;

      const from = sorted.findIndex((f) => f.key === active.id);
      const to = sorted.findIndex((f) => f.key === over.id);
      if (from < 0 || to < 0) return;

      // Reindexamos `order` de forma explícita: el índice del array no es la verdad,
      // la verdad es el campo `order` que persiste en la BD.
      onChange(arrayMove(sorted, from, to).map((f, i) => ({ ...f, order: i + 1 })));
    },
    [sorted, onChange],
  );

  const addField = (type: Field['type']) => {
    if (type === 'location' && hasLocation) return; // uno y solo uno
    const f = newField(type, sorted.length + 1);
    onChange([...sorted, f]);
    onSelect(f.key);
  };

  const removeField = (key: string) => {
    onChange(sorted.filter((f) => f.key !== key).map((f, i) => ({ ...f, order: i + 1 })));
    if (selectedKey === key) onSelect(null);
  };

  const duplicateField = (key: string) => {
    const src = sorted.find((f) => f.key === key);
    if (!src) return;
    if (src.type === 'location') return;
    const copy: Field = {
      ...src,
      key: `${src.type}_${Math.random().toString(36).slice(2, 7)}`,
      label: `${src.label} (copia)`,
      order: src.order + 1,
    };
    const out = [...sorted];
    out.splice(sorted.indexOf(src) + 1, 0, copy);
    onChange(out.map((f, i) => ({ ...f, order: i + 1 })));
  };

  return (
    <InlineStack gap="400" align="start" blockAlign="start" wrap={false}>
      {/* ── Paleta ── */}
      <Box minWidth="190px">
        <Card padding="300">
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Añadir bloque</Text>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PALETTE.map((p) => {
                const disabled = p.type === 'location' && hasLocation;
                const btn = (
                  <button
                    key={p.type}
                    type="button"
                    disabled={disabled}
                    onClick={() => addField(p.type)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '9px 4px', border: '1px solid #e1e3e5', borderRadius: 8,
                      background: disabled ? '#f6f6f7' : '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1, fontSize: 10.5, lineHeight: 1.2,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                );
                return disabled ? (
                  <Tooltip key={p.type} content="Solo se permite un bloque de ubicación por formulario">
                    <div>{btn}</div>
                  </Tooltip>
                ) : btn;
              })}
            </div>
          </BlockStack>
        </Card>
      </Box>

      {/* ── Lienzo ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Card padding="300">
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Campos del formulario</Text>
              <Text as="span" tone="subdued" variant="bodySm">Arrastra para reordenar</Text>
            </InlineStack>

            {sorted.length === 0 && (
              <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                <Text as="p" tone="subdued" alignment="center">
                  Añade tu primer bloque desde la paleta.
                </Text>
              </Box>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleStart}
              onDragEnd={handleEnd}
            >
              <SortableContext items={sorted.map((f) => f.key)} strategy={verticalListSortingStrategy}>
                <BlockStack gap="150">
                  {sorted.map((f) => (
                    <SortableRow
                      key={f.key}
                      field={f}
                      selected={selectedKey === f.key}
                      onSelect={() => onSelect(f.key)}
                      onRemove={() => removeField(f.key)}
                      onDuplicate={() => duplicateField(f.key)}
                    />
                  ))}
                </BlockStack>
              </SortableContext>

              <DragOverlay>
                {dragging && <RowChrome field={dragging} selected floating />}
              </DragOverlay>
            </DndContext>
          </BlockStack>
        </Card>
      </div>
    </InlineStack>
  );
}

function SortableRow({
  field, selected, onSelect, onRemove, onDuplicate,
}: {
  field: Field;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.key });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      onClick={onSelect}
    >
      <RowChrome
        field={field}
        selected={selected}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function RowChrome({
  field, selected, floating, onRemove, onDuplicate, handleProps,
}: {
  field: Field;
  selected: boolean;
  floating?: boolean;
  onRemove?: () => void;
  onDuplicate?: () => void;
  handleProps?: Record<string, unknown>;
}) {
  const meta = PALETTE.find((p) => p.type === field.type);
  const isContent = ['heading', 'subheading', 'divider', 'html', 'image', 'video'].includes(field.type);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
        border: `1.5px solid ${selected ? '#005bd3' : '#e1e3e5'}`,
        borderRadius: 8,
        background: selected ? '#f2f7fe' : '#fff',
        boxShadow: floating ? '0 6px 20px rgba(0,0,0,.16)' : 'none',
        cursor: 'pointer',
      }}
    >
      <span
        {...handleProps}
        style={{ cursor: 'grab', color: '#8a8a8a', fontSize: 14, padding: '0 2px', touchAction: 'none' }}
        aria-label="Arrastrar"
      >
        ⠿
      </span>

      <span style={{ width: 22, textAlign: 'center', fontSize: 13 }}>{meta?.icon}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Text as="span" variant="bodyMd" truncate>
          {field.label || field.content || meta?.label}
        </Text>
        <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
          <Text as="span" variant="bodySm" tone="subdued">{field.width}%</Text>
          {field.required && !isContent && <Badge tone="critical" size="small">Obligatorio</Badge>}
          {field.conditions.length > 0 && <Badge tone="info" size="small">Condicional</Badge>}
          {!field.visible && <Badge size="small">Oculto</Badge>}
        </div>
      </div>

      {!floating && (
        <InlineStack gap="100">
          <Button
            size="micro" variant="tertiary"
            onClick={(e) => { (e as unknown as Event).stopPropagation(); onDuplicate?.(); }}
            accessibilityLabel="Duplicar"
          >
            ⧉
          </Button>
          <Button
            size="micro" variant="tertiary" tone="critical"
            onClick={(e) => { (e as unknown as Event).stopPropagation(); onRemove?.(); }}
            accessibilityLabel="Eliminar"
          >
            ✕
          </Button>
        </InlineStack>
      )}
    </div>
  );
}
