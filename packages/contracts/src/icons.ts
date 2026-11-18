/* Sin dependencias: el widget de la tienda lo importa sin cargar zod. */
/* ─────────────── Iconos de los botones ─────────────── */
/** Iconos de línea (24×24, trazo = currentColor). Los usan el formulario y el editor. */
export const BUTTON_ICONS: Record<string, { label: string; svg: string }> = {
  cart: { label: 'Carrito', svg: '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2.5 3h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L21 7H6"/>' },
  bag: { label: 'Bolsa', svg: '<path d="M5 8h14l-1 12.2a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 20.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>' },
  truck: { label: 'Envío', svg: '<path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 9.5h4l3.5 3.5v2.5h-7.5"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>' },
  cash: { label: 'Efectivo', svg: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>' },
  'check-circle': { label: 'Listo', svg: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>' },
  check: { label: 'Visto', svg: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' },
  lock: { label: 'Seguro', svg: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>' },
  shield: { label: 'Garantía', svg: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.2-4.3"/>' },
  package: { label: 'Paquete', svg: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>' },
  arrow: { label: 'Flecha', svg: '<path d="M5 12h14M13 6l6 6-6 6"/>' },
  bolt: { label: 'Rápido', svg: '<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z"/>' },
  gift: { label: 'Regalo', svg: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5"/><path d="M12 8C9.5 8 7.5 7 7.5 5.3S9.6 3 12 8zM12 8c2.5 0 4.5-1 4.5-2.7S14.4 3 12 8z"/>' },
  tag: { label: 'Oferta', svg: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/>' },
  heart: { label: 'Corazón', svg: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>' },
  star: { label: 'Estrella', svg: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/>' },
};

/** SVG completo de un icono (vacío si el nombre no existe). */
export function buttonIconSvg(name: string, className = ''): string {
  const icon = BUTTON_ICONS[name];
  if (!icon) return '';
  return `<svg class="${className}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.svg}</svg>`;
}
