import { useCallback, useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionList, Badge, BlockStack, Button, Icon, InlineStack, Popover, Text, Tooltip } from '@shopify/polaris';
import { DeleteIcon, DragHandleIcon, DuplicateIcon, PlusIcon } from '@shopify/polaris-icons';
import type { Field } from '@cod/contracts';
import { newField } from '../../lib/defaults';
import { ADDABLE_TYPES, CONTENT_TYPES, FIELD_META, GROUPS, fieldTitle } from './fieldMeta';

/**
 * Lista de campos del formulario: arrastrar para ordenar, clic para editar.
 * El orden real es `order` (se reindexa en cada cambio).
 */
export function FieldList({
  fields, onChange, onSelect,
}: {
  fields: Field[];
  onChange: (f: Field[]) => void;
  onSelect: (key: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => [...fields].sort((a, b) => a.order - b.order), [fields]);
  const hasLocation = fields.some((f) => f.type === 'location');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reindex = (list: Field[]) => list.map((f, i) => ({ ...f, order: i + 1 }));

  const handleEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = sorted.findIndex((f) => f.key === active.id);
    const to = sorted.findIndex((f) => f.key === over.id);
    if (from < 0 || to < 0) return;
    onChange(reindex(arrayMove(sorted, from, to)));
  }, [sorted, onChange]);

  const add = (type: Field['type']) => {
    setAdding(false);
    if (type === 'location' && hasLocation) return;
    const f = newField(type, sorted.length + 1);
    onChange([...sorted, f]);
    onSelect(f.key);
  };

  const remove = (key: string) => onChange(reindex(sorted.filter((f) => f.key !== key)));

  const duplicate = (key: string) => {
    const i = sorted.findIndex((f) => f.key === key);
    const src = sorted[i];
    if (!src || src.type === 'location') return;
    const copy: Field = { ...src, key: `${src.type}_${Math.random().toString(36).slice(2, 7)}`, label: src.label ? `${src.label} (copia)` : src.label };
    const out = [...sorted];
    out.splice(i + 1, 0, copy);
    onChange(reindex(out));
  };

  return (
    <BlockStack gap="300">
      <DndContext id="form-fields-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
        <SortableContext items={sorted.map((f) => f.key)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'grid', gap: 6 }}>
            {sorted.map((f) => (
              <Row key={f.key} field={f} onOpen={() => onSelect(f.key)}
                onRemove={() => remove(f.key)} onDuplicate={() => duplicate(f.key)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sorted.length === 0 && (
        <Text as="p" tone="subdued" alignment="center">Todavía no hay campos. Añade el primero.</Text>
      )}

      <Popover
        active={adding}
        onClose={() => setAdding(false)}
        preferredAlignment="left"
        fullWidth
        activator={
          <Button icon={PlusIcon} fullWidth onClick={() => setAdding((v) => !v)} disclosure={adding ? 'up' : 'down'}>
            Añadir campo
          </Button>
        }
      >
        <ActionList
          sections={GROUPS.map((g) => ({
            title: g.title,
            items: ADDABLE_TYPES.filter((t) => FIELD_META[t].group === g.id).map((t) => ({
              content: FIELD_META[t].label,
              helpText: t === 'location' && hasLocation ? 'Ya está en el formulario' : FIELD_META[t].hint,
              prefix: <Icon source={FIELD_META[t].icon} tone="base" />,
              disabled: t === 'location' && hasLocation,
              onAction: () => add(t),
            })),
          }))}
        />
      </Popover>
    </BlockStack>
  );
}

function Row({
  field, onOpen, onRemove, onDuplicate,
}: {
  field: Field;
  onOpen: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const meta = FIELD_META[field.type];
  const isContent = CONTENT_TYPES.includes(field.type);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : undefined,
        boxShadow: isDragging ? '0 6px 18px rgba(0,0,0,.15)' : undefined,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 8px 8px 4px',
        background: '#fff',
        border: '1px solid #e3e3e3',
        borderRadius: 10,
        opacity: field.visible ? 1 : 0.55,
      }}
    >
      <span {...attributes} {...listeners} aria-label="Arrastrar para ordenar"
        style={{ cursor: 'grab', touchAction: 'none', display: 'flex', padding: 2 }}>
        <Icon source={DragHandleIcon} tone="subdued" />
      </span>

      <button type="button" onClick={onOpen}
        style={{ all: 'unset', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, background: '#f1f1f1',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon source={meta?.icon} tone="base" />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <Text as="span" variant="bodyMd" fontWeight="semibold" truncate>{fieldTitle(field)}</Text>
          <InlineStack gap="100" blockAlign="center">
            <Text as="span" variant="bodySm" tone="subdued">{meta?.label}</Text>
            {!isContent && field.required && <Badge size="small" tone="attention">Obligatorio</Badge>}
            {field.conditions.length > 0 && <Badge size="small" tone="info">Condicional</Badge>}
            {!field.visible && <Badge size="small">Oculto</Badge>}
          </InlineStack>
        </span>
      </button>

      {field.type !== 'location' && (
        <Tooltip content="Duplicar">
          <Button variant="tertiary" icon={DuplicateIcon} onClick={onDuplicate} accessibilityLabel="Duplicar" />
        </Tooltip>
      )}
      <Tooltip content="Eliminar">
        <Button variant="tertiary" tone="critical" icon={DeleteIcon} onClick={onRemove} accessibilityLabel="Eliminar" />
      </Tooltip>
    </div>
  );
}
