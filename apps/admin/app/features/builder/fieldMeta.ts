import {
  CalendarIcon, CheckboxIcon, CheckCircleIcon, ClockIcon, CodeIcon, EmailIcon, HashtagIcon,
  ImageIcon, ListBulletedIcon, LocationIcon, MinusIcon, PhoneIcon, PlayIcon, SelectIcon,
  TextAlignLeftIcon, TextBlockIcon, TextFontIcon, TextIcon, TextTitleIcon, UploadIcon,
} from '@shopify/polaris-icons';
import type { Field } from '@cod/contracts';

type IconSource = typeof TextIcon;

export interface FieldMeta {
  label: string;
  icon: IconSource;
  group: 'datos' | 'opciones' | 'contenido' | 'avanzado';
  hint: string;
}

/** Nombre, icono y grupo de cada tipo de campo. Una sola fuente para todo el editor. */
export const FIELD_META: Record<Field['type'], FieldMeta> = {
  text: { label: 'Texto corto', icon: TextIcon, group: 'datos', hint: 'Nombre, apellido, referencia…' },
  textarea: { label: 'Texto largo', icon: TextBlockIcon, group: 'datos', hint: 'Dirección, notas…' },
  email: { label: 'Correo', icon: EmailIcon, group: 'datos', hint: 'Valida que sea un correo' },
  phone: { label: 'Teléfono', icon: PhoneIcon, group: 'datos', hint: 'WhatsApp del cliente' },
  number: { label: 'Número', icon: HashtagIcon, group: 'datos', hint: 'Solo cifras' },
  date: { label: 'Fecha', icon: CalendarIcon, group: 'datos', hint: 'Día de entrega preferido…' },
  time: { label: 'Hora', icon: ClockIcon, group: 'datos', hint: 'Horario preferido' },
  location: { label: 'Ubicación con mapa', icon: LocationIcon, group: 'datos', hint: 'GPS o dirección escrita' },
  select: { label: 'Lista desplegable', icon: SelectIcon, group: 'opciones', hint: 'Elegir una opción de una lista' },
  radio: { label: 'Opción única', icon: CheckCircleIcon, group: 'opciones', hint: 'Botones para elegir una' },
  multiselect: { label: 'Varias opciones', icon: ListBulletedIcon, group: 'opciones', hint: 'Elegir varias' },
  checkbox: { label: 'Casilla', icon: CheckboxIcon, group: 'opciones', hint: 'Aceptar condiciones…' },
  heading: { label: 'Título', icon: TextTitleIcon, group: 'contenido', hint: 'Texto grande' },
  subheading: { label: 'Subtítulo', icon: TextFontIcon, group: 'contenido', hint: 'Texto mediano' },
  richtext: { label: 'Párrafo', icon: TextAlignLeftIcon, group: 'contenido', hint: 'Texto explicativo' },
  divider: { label: 'Separador', icon: MinusIcon, group: 'contenido', hint: 'Línea divisoria' },
  image: { label: 'Imagen', icon: ImageIcon, group: 'contenido', hint: 'Una imagen por URL' },
  video: { label: 'Video', icon: PlayIcon, group: 'contenido', hint: 'Video por URL' },
  file: { label: 'Subir archivo', icon: UploadIcon, group: 'avanzado', hint: 'El cliente adjunta un archivo' },
  html: { label: 'HTML personalizado', icon: CodeIcon, group: 'avanzado', hint: 'Solo si sabes HTML' },
  map: { label: 'Mapa (antiguo)', icon: LocationIcon, group: 'avanzado', hint: 'Usa «Ubicación con mapa»' },
};

/** Tipos que se pueden añadir desde el editor (subir archivo y mapa antiguo no se envían en el pedido). */
export const ADDABLE_TYPES = (Object.keys(FIELD_META) as Field['type'][])
  .filter((t) => t !== 'file' && t !== 'map');

export const GROUPS: { id: FieldMeta['group']; title: string }[] = [
  { id: 'datos', title: 'Datos del cliente' },
  { id: 'opciones', title: 'Opciones para elegir' },
  { id: 'contenido', title: 'Textos e imágenes' },
  { id: 'avanzado', title: 'Avanzado' },
];

/** Bloques que no piden datos al cliente (solo muestran contenido). */
export const CONTENT_TYPES: Field['type'][] = ['heading', 'subheading', 'richtext', 'divider', 'html', 'image', 'video'];
export const OPTION_TYPES: Field['type'][] = ['select', 'radio', 'multiselect'];

/** Texto que identifica el campo en la lista. */
export function fieldTitle(f: Field): string {
  const meta = FIELD_META[f.type];
  if (CONTENT_TYPES.includes(f.type)) return f.content?.trim() || meta?.label || f.type;
  return f.label?.trim() || f.content?.trim() || meta?.label || f.key;
}
