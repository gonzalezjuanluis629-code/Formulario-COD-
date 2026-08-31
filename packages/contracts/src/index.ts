/**
 * FUENTE ÚNICA DE VERDAD.
 * El widget y la API importan estos mismos schemas. Es imposible que la
 * validación del cliente y la del servidor diverjan.
 */
import { z } from 'zod';

/* ─────────────── Ubicación ─────────────── */
export const LocationSourceSchema = z.enum(['GPS', 'MAP_PIN', 'MANUAL', 'NONE']);
export type LocationSource = z.infer<typeof LocationSourceSchema>;

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().nullable().optional(),
  source: LocationSourceSchema,
  capturedAt: z.string().datetime(),
});
export type Location = z.infer<typeof LocationSchema>;

/* ─────────────── Campos del formulario ─────────────── */
export const FieldTypeSchema = z.enum([
  'text', 'textarea', 'email', 'phone', 'number', 'date', 'time',
  'select', 'checkbox', 'radio', 'multiselect',
  'heading', 'subheading', 'richtext', 'divider', 'html', 'image', 'video',
  'location', 'map', 'file',
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

/** Regla condicional (JSON-Logic simplificado). Evaluada en cliente Y servidor. */
export const ConditionSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'notEmpty']),
  value: z.unknown().optional(),
});

export const FieldSchema = z.object({
  key: z.string().min(1),
  type: FieldTypeSchema,
  label: z.string().default(''),
  placeholder: z.string().default(''),
  help: z.string().default(''),
  required: z.boolean().default(false),
  defaultValue: z.string().nullable().default(null),
  width: z.enum(['25', '33', '50', '66', '75', '100']).default('100'),
  order: z.number().int().default(0),
  visible: z.boolean().default(true),
  options: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  validation: z.object({
    minLength: z.number().int().nullable().default(null),
    maxLength: z.number().int().nullable().default(null),
    regex: z.string().nullable().default(null),
    message: z.string().nullable().default(null),
  }).default({ minLength: null, maxLength: null, regex: null, message: null }),
  /** Se muestra solo si TODAS estas condiciones se cumplen. */
  conditions: z.array(ConditionSchema).default([]),
  /** Contenido para bloques no-input (heading, html, image…). */
  content: z.string().default(''),
});
export type Field = z.infer<typeof FieldSchema>;

/* ─────────────── Botón que ABRE el formulario ("Comprar ahora") ───────────────
 * Vive en el tema, fuera del Shadow DOM del formulario. Por eso tiene su propia
 * config: tamaño, icono/imagen y descripciones rotativas tipo carrusel. */
export const TriggerButtonSchema = z.object({
  text: z.string().default('Comprar ahora'),
  /** '' = ancho automático; '100%' = ancho completo; o un valor en px. */
  width: z.string().default('auto'),
  height: z.number().int().min(36).max(96).default(52),
  fontSize: z.number().min(12).max(28).default(15),
  descriptionFontSize: z.number().min(9).max(18).default(12),
  bg: z.string().default('#111111'),
  color: z.string().default('#ffffff'),
  radius: z.number().int().min(0).max(60).default(100),
  /** Icono: un emoji/carácter, o una URL de imagen si iconType === 'image'. */
  iconType: z.enum(['none', 'emoji', 'image']).default('emoji'),
  icon: z.string().default('🛒'),
  iconImageUrl: z.string().nullable().default(null),
  /** Hasta 5 descripciones que rotan bajo el título (carrusel). */
  descriptions: z.array(z.string()).max(5).default([
    'Envío gratis a todo el país',
    'Pago contra entrega',
  ]),
  descriptionIntervalMs: z.number().int().min(1000).max(10000).default(3000),
  animation: z.enum(['none', 'pulse', 'shine', 'bounce']).default('pulse'),
});
export type TriggerButton = z.infer<typeof TriggerButtonSchema>;

/* ─────────────── Botón que ENVÍA el formulario ("Finalizar pedido") ─────────────── */
export const SubmitButtonSchema = z.object({
  text: z.string().default('Finalizar pedido'),
  height: z.number().int().min(38).max(72).default(48),
  fontSize: z.number().min(12).max(24).default(15),
  radius: z.number().int().min(0).max(40).default(12),
  bg: z.string().default('#111111'),
  color: z.string().default('#ffffff'),
  /** Color al que cambia cuando el formulario está completo. */
  readyBg: z.string().default('#16a34a'),
  iconType: z.enum(['none', 'emoji']).default('none'),
  icon: z.string().default('→'),
  animation: z.enum(['none', 'pulse', 'shine']).default('none'),
});
export type SubmitButton = z.infer<typeof SubmitButtonSchema>;

/* ─────────────── Pantalla final + WhatsApp ─────────────── */
export const ConfirmationSchema = z.object({
  title: z.string().default('¡Pedido confirmado!'),
  message: z.string().default('Te contactamos por WhatsApp para coordinar la entrega.'),
  /** A dónde va el cliente tras confirmar. */
  redirectTarget: z.enum(['thankyou', 'whatsapp', 'none']).default('thankyou'),
  whatsapp: z.object({
    enabled: z.boolean().default(false),
    /** E.164 sin el '+', como exige wa.me. Ej: 18095551234 */
    phone: z.string().default(''),
    /** Plantilla con variables: {nombre} {telefono} {pedido} {total} */
    messageTemplate: z.string().default('Hola, soy {nombre} y ya realicé mi pedido {pedido}.'),
  }).default({ enabled: false, phone: '', messageTemplate: 'Hola, soy {nombre} y ya realicé mi pedido {pedido}.' }),
});
export type Confirmation = z.infer<typeof ConfirmationSchema>;

/* ─────────────── Anti-fraude ─────────────── */
export const AntifraudSettingsSchema = z.object({
  /** Pedidos con riesgo >= este umbral se RETIENEN para revisión manual. */
  holdHighRisk: z.boolean().default(false),
  riskThreshold: z.number().int().min(0).max(100).default(50),
  /** Máximo de pedidos por teléfono en 24 h (0 = sin límite). */
  maxOrdersPerPhonePerDay: z.number().int().min(0).default(0),
  /** Cloudflare Turnstile (CAPTCHA invisible). Vacío = desactivado. */
  turnstileSiteKey: z.string().default(''),
  turnstileSecret: z.string().default(''),
});
export type AntifraudSettings = z.infer<typeof AntifraudSettingsSchema>;

/* ─────────────── Tracking / píxeles ───────────────
 * El evento de compra se envía DOBLE: desde el navegador (píxel) y desde el
 * servidor (CAPI), con el MISMO eventId para que Meta lo deduplique. El
 * server-side es el que cuenta de verdad: los ad-blockers e iOS matan el píxel. */
export const TrackingSettingsSchema = z.object({
  metaPixelId: z.string().default(''),
  /** Token de la Conversions API de Meta. Vive en el servidor, nunca en el widget. */
  metaCapiToken: z.string().default(''),
  /** Test event code de Meta, para depurar en el Events Manager. */
  metaTestCode: z.string().default(''),
  tiktokPixelId: z.string().default(''),
  tiktokToken: z.string().default(''),
  ga4MeasurementId: z.string().default(''),
  ga4ApiSecret: z.string().default(''),
  /** Nombre del evento de conversión. Purchase por defecto. */
  purchaseEventName: z.string().default('Purchase'),
});
export type TrackingSettings = z.infer<typeof TrackingSettingsSchema>;

/** Eventos de embudo que emite el widget. */
export const TrackEventSchema = z.object({
  formId: z.string(),
  event: z.enum(['view', 'start', 'field_error', 'submit_attempt', 'abandon']),
  /** Campo donde ocurrió (para saber dónde abandonan). */
  field: z.string().nullable().optional(),
  sessionId: z.string(),
  ts: z.number().int().optional(),
});
export type TrackEvent = z.infer<typeof TrackEventSchema>;

/* ─────────────── Diseño (design tokens) ─────────────── */
export const ThemeTokensSchema = z.object({
  brand: z.string().default('#111111'),
  success: z.string().default('#16a34a'),
  danger: z.string().default('#e53935'),
  surface: z.string().default('#ffffff'),
  field: z.string().default('#fafafa'),
  border: z.string().default('#e4e4e4'),
  text: z.string().default('#111111'),
  muted: z.string().default('#8a8a8a'),
  fontFamily: z.string().default('-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'),
  fontSize: z.number().default(14.5),
  radius: z.number().default(10),
  buttonRadius: z.number().default(12),
  buttonHeight: z.number().default(48),
  buttonText: z.string().default('Finalizar pedido'),
  shadow: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
  spacing: z.enum(['compact', 'normal', 'relaxed']).default('compact'),
  animations: z.boolean().default(true),
  progressBar: z.boolean().default(true),
  progressColor: z.string().default('#16a34a'),
  /** Color del botón de envío cuando el formulario está completo. */
  readyColor: z.string().default('#16a34a'),
  logoUrl: z.string().nullable().default(null),
  darkMode: z.boolean().default(false),
  customCss: z.string().default(''),
  /** Botones (trigger y submit) totalmente configurables. */
  trigger: TriggerButtonSchema.default({}),
  submit: SubmitButtonSchema.default({}),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

/* ─────────────── Ubicación: configuración ─────────────── */
export const LocationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  gpsEnabled: z.boolean().default(true),
  manualEnabled: z.boolean().default(true),
  requireLocation: z.boolean().default(false),
  lockAfterCapture: z.boolean().default(true),
  defaultCenter: z.object({ lat: z.number(), lng: z.number() })
    .default({ lat: 18.4861, lng: -69.9312 }),
  defaultZoom: z.number().int().min(10).max(19).default(17),
  gpsLabel: z.string().default('Usar mi ubicación actual'),
  gpsHint: z.string().default('Tomada del mapa, precisa'),
  manualLabel: z.string().default('Escribirla'),
  manualHint: z.string().default('La escribes tú mismo'),
});
export type LocationConfig = z.infer<typeof LocationConfigSchema>;

/* ─────────────── Ajustes de la tienda ─────────────── */
export const ShopSettingsSchema = z.object({
  /** Página de gracias del TEMA. Nunca una URL fija en el código. */
  thankYouUrl: z.string().default('/pages/gracias'),
  redirectDelayMs: z.number().int().min(0).max(15000).default(3000),
  orderTag: z.string().default('COD'),
  gateway: z.string().default('Cash on Delivery (COD)'),
  currency: z.string().default('DOP'),
  freeShippingOverCents: z.number().int().nullable().default(350000),
  defaultShippingCents: z.number().int().default(25000),
  /** Tarifa de envío por provincia (código DO-XX → centavos). Si falta, usa la default. */
  shippingByProvince: z.record(z.string(), z.number().int()).default({}),
  /** Recargo por pagar contra entrega (COD fee). 0 = sin recargo. */
  codFeeCents: z.number().int().min(0).default(0),
  codFeeLabel: z.string().default('Recargo contra entrega'),
  /** El cliente NUNCA ve el resumen del pedido. Solo el admin, en el panel. */
  showOrderSummaryToCustomer: z.boolean().default(false),
  /** Pantalla final + redirección (incluye WhatsApp). */
  confirmation: ConfirmationSchema.default({}),
  antifraud: AntifraudSettingsSchema.default({}),
  tracking: TrackingSettingsSchema.default({}),
});
export type ShopSettings = z.infer<typeof ShopSettingsSchema>;

/* ─────────────── Ofertas y descuentos ─────────────── */
export const OfferSchema = z.object({
  id: z.string(),
  type: z.enum(['QUANTITY', 'FREE_SHIPPING', 'PERCENTAGE']),
  minQty: z.number().int().min(1),
  /** Basis points: 1000 = 10 %. Enteros, nada de floats con dinero. */
  discountBps: z.number().int().min(0).max(10000).default(0),
  freeShipping: z.boolean().default(false),
  label: z.string(),
});
export type Offer = z.infer<typeof OfferSchema>;

/* ─────────────── AOV: upsells, order bumps, downsells ───────────────
 * Un "Addon" es un producto EXTRA que se puede sumar al pedido:
 *   - ORDER_BUMP: casilla de un clic ("añade la garantía por RD$290").
 *   - UPSELL: se ofrece un producto mejor/complementario, con imagen y precio.
 *   - DOWNSELL: si rechaza el upsell, se le ofrece una alternativa más barata.
 * Todos apuntan a una variante REAL de Shopify; el precio lo pone el servidor. */
export const AddonSchema = z.object({
  id: z.string(),
  kind: z.enum(['ORDER_BUMP', 'UPSELL', 'DOWNSELL']),
  variantId: z.string(),          // gid://shopify/ProductVariant/…
  title: z.string(),
  description: z.string().default(''),
  image: z.string().nullable().default(null),
  /** Precio con el que se muestra (informativo). El servidor recalcula. */
  priceCents: z.number().int(),
  compareAtCents: z.number().int().nullable().default(null),
  qty: z.number().int().min(1).default(1),
  /** Para downsell: id del upsell al que reemplaza si se rechaza. */
  replacesId: z.string().nullable().default(null),
  /** Se muestra solo si el carrito supera este umbral (0 = siempre). */
  minCartCents: z.number().int().default(0),
});
export type Addon = z.infer<typeof AddonSchema>;

/** Lo que el cliente aceptó, para enviarlo con el pedido. */
export const AcceptedAddonSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  qty: z.number().int().min(1),
});
export type AcceptedAddon = z.infer<typeof AcceptedAddonSchema>;

/* ─────────────── Config que consume el widget ─────────────── */
export const WidgetConfigSchema = z.object({
  formId: z.string(),
  formVersionId: z.string(),
  fields: z.array(FieldSchema),
  tokens: ThemeTokensSchema,
  location: LocationConfigSchema,
  settings: ShopSettingsSchema,
  offers: z.array(OfferSchema).default([]),
  addons: z.array(AddonSchema).default([]),
  product: z.object({
    variantId: z.string(),
    title: z.string(),
    unitPriceCents: z.number().int(),
    image: z.string().nullable(),
  }),
});
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

/* ─────────────── Cotización ─────────────── */
export const QuoteRequestSchema = z.object({
  formId: z.string(),
  variantId: z.string(),
  qty: z.number().int().min(1).max(50),
  province: z.string().nullable().optional(),
  discountCode: z.string().max(64).nullable().optional(),
  /** IDs de addons aceptados (order bumps / upsells / downsells). */
  addonIds: z.array(z.string()).default([]),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteResponseSchema = z.object({
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  shippingCents: z.number().int(),
  addonsCents: z.number().int().default(0),
  codFeeCents: z.number().int().default(0),
  totalCents: z.number().int(),
  currency: z.string(),
  appliedOffer: z.string().nullable(),
  appliedDiscount: z.object({
    code: z.string(),
    source: z.enum(['SHOPIFY', 'APP']),
    label: z.string(),
  }).nullable(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

/* ─────────────── Envío del formulario ─────────────── */
export const SubmitRequestSchema = z.object({
  formId: z.string(),
  formVersionId: z.string(),
  idempotencyKey: z.string().uuid(),
  variantId: z.string(),
  qty: z.number().int().min(1).max(50),
  discountCode: z.string().max(64).nullable().optional(),
  /** Addons aceptados: se convierten en líneas extra del pedido. */
  acceptedAddons: z.array(AcceptedAddonSchema).default([]),
  /** Valores de los campos dinámicos, indexados por `key`. */
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  location: LocationSchema.nullable(),
  /** Solo para detectar manipulación. El servidor SIEMPRE recalcula. */
  clientTotals: z.object({ totalCents: z.number().int() }).nullable().optional(),
  /** Anti-bot: debe venir vacío. */
  hp: z.string().max(0).optional(),
  startedAt: z.number().int().optional(),
});
export type SubmitRequest = z.infer<typeof SubmitRequestSchema>;

export const SubmitResponseSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  /** Texto de la pantalla final (editable desde el panel). */
  title: z.string(),
  message: z.string(),
  /** 'thankyou' | 'whatsapp' | 'none' */
  redirectTarget: z.enum(['thankyou', 'whatsapp', 'none']),
  /** Página de gracias del tema, ya resuelta. */
  redirectUrl: z.string(),
  /** URL wa.me lista (número + mensaje con variables sustituidas), o null. */
  whatsappUrl: z.string().nullable(),
  redirectDelayMs: z.number().int(),
  /** Píxel de compra (client-side). El eventId se comparte con el CAPI para deduplicar. */
  purchasePixel: z.object({
    eventId: z.string(),
    valueCents: z.number().int(),
    currency: z.string(),
    metaPixelId: z.string().nullable(),
    tiktokPixelId: z.string().nullable(),
    eventName: z.string(),
  }).nullable(),
});
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;

/* ─────────────── Geo ─────────────── */
export const ReverseGeocodeRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const ReverseGeocodeResponseSchema = z.object({
  formatted: z.string().nullable(),
  country: z.string().nullable(),
  province: z.string().nullable(),
  provinceCode: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  postalCode: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type ReverseGeocodeResponse = z.infer<typeof ReverseGeocodeResponseSchema>;
