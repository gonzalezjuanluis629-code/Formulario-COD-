import { DO_PROVINCES } from '@cod/geo';
import type { Field } from '@cod/contracts';

/** Lo que se crea en la primera instalación. El merchant lo edita desde el builder. */
export const DEFAULT_FIELDS: Field[] = [
  {
    key: 'fullName', type: 'text', label: 'Nombre completo', placeholder: 'Tu nombre completo',
    help: '', required: true, defaultValue: null, width: '100', order: 1, visible: true,
    options: [], conditions: [], content: '',
    validation: { minLength: 3, maxLength: 80, regex: null, message: null },
  },
  {
    key: 'phone', type: 'phone', label: 'WhatsApp', placeholder: '809 000 0000',
    help: '', required: true, defaultValue: null, width: '50', order: 2, visible: true,
    options: [], conditions: [], content: '',
    validation: { minLength: null, maxLength: null, regex: null, message: null },
  },
  {
    key: 'email', type: 'email', label: 'Correo', placeholder: 'tucorreo@ejemplo.com',
    help: '', required: false, defaultValue: null, width: '50', order: 3, visible: true,
    options: [], conditions: [], content: '',
    validation: { minLength: null, maxLength: null, regex: null, message: null },
  },
  {
    key: 'location', type: 'location', label: 'Dirección de entrega', placeholder: '',
    help: '', required: true, defaultValue: null, width: '100', order: 4, visible: true,
    options: [], conditions: [], content: '',
    validation: { minLength: null, maxLength: null, regex: null, message: null },
  },
  {
    key: 'province', type: 'select', label: 'Provincia', placeholder: 'Selecciona tu provincia',
    help: '', required: true, defaultValue: null, width: '100', order: 5, visible: true,
    options: DO_PROVINCES.map((p) => ({ label: p.name, value: p.code })),
    // Solo aparece si el cliente eligió escribir la dirección.
    conditions: [{ field: 'locationMode', op: 'eq', value: 'manual' }],
    content: '',
    validation: { minLength: null, maxLength: null, regex: null, message: null },
  },
  {
    key: 'address', type: 'textarea', label: 'Dirección',
    placeholder: 'Calle, número, sector y punto de referencia…',
    help: '', required: true, defaultValue: null, width: '100', order: 6, visible: true,
    options: [], conditions: [{ field: 'locationMode', op: 'eq', value: 'manual' }], content: '',
    validation: { minLength: 5, maxLength: 300, regex: null, message: null },
  },
  {
    key: 'confirm', type: 'checkbox', label: '', placeholder: '',
    content: 'Confirmo que recibiré mi pedido.',
    help: '', required: true, defaultValue: null, width: '100', order: 7, visible: true,
    options: [], conditions: [],
    validation: { minLength: null, maxLength: null, regex: null, message: null },
  },
];


/** Un campo nuevo nace con valores sensatos, no vacío. */
export function newField(type: Field['type'], order: number): Field {
  const labels: Partial<Record<Field['type'], string>> = {
    text: 'Nuevo campo', textarea: 'Comentario', email: 'Correo', phone: 'Teléfono',
    number: 'Cantidad', date: 'Fecha', time: 'Hora', select: 'Selecciona una opción',
    checkbox: 'Acepto', radio: 'Elige una', multiselect: 'Elige varias',
    location: 'Dirección de entrega', heading: 'Título', subheading: 'Subtítulo',
    discount: '¿Tienes un código de descuento?',
  };
  return {
    key: `${type}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: labels[type] ?? '',
    placeholder: type === 'discount' ? 'Escribe tu código' : '',
    help: '',
    required: false,
    defaultValue: null,
    width: '100',
    order,
    visible: true,
    options: type === 'select' || type === 'radio' || type === 'multiselect'
      ? [{ label: 'Opción 1', value: 'opcion-1' }]
      : [],
    conditions: [],
    content: ({
      heading: 'Título', subheading: 'Subtítulo', checkbox: 'Acepto los términos',
      richtext: 'Escribe aquí tu texto.', discount: 'Aplicar',
    } as Partial<Record<Field['type'], string>>)[type] ?? '',
    validation: { minLength: null, maxLength: null, regex: null, message: null },
    look: { icon: '', color: '', align: 'left', size: 'md' },
  };
}
