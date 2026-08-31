# COD Forms — Fase 0 + Fase 1

App de Formulario Contra Entrega para Shopify. Multi-tienda, dockerizada,
solo APIs oficiales de Shopify.

## Qué hay implementado (Fase 0 + 1)

| Área | Estado |
|---|---|
| Monorepo + Docker (dev y prod) | ✅ |
| Postgres + Prisma (multi-tenant) | ✅ |
| Multi-credencial: N custom apps → 1 backend (Camino A) | ✅ |
| Cifrado de PII (AES-256-GCM, clave por tienda) | ✅ |
| App Proxy con verificación HMAC | ✅ |
| Webhooks (incl. los 3 de compliance) | ✅ |
| Theme App Extension (App Block + App Embed) | ✅ |
| Widget en Shadow DOM, campos dinámicos | ✅ |
| Ubicación: GPS + mapa bloqueado + editar | ✅ |
| Reverse geocoding (Google, tras adapter, con caché geohash) | ✅ |
| Cotización: ofertas por cantidad + descuentos Shopify/app | ✅ |
| **Pedido real con `orderCreate`** | ✅ |
| Idempotencia + Outbox + reintentos | ✅ |
| Antifraude sin OTP (rate limit, dedup, riesgo GPS) | ✅ |
| Pantalla final sin resumen + redirect configurable | ✅ |
| Panel admin visual (drag & drop) | ⏳ Fase 3 |
| Upsells, analítica, A/B testing | ⏳ Fases 4-7 |

## Arranque

```bash
cp .env.example .env
openssl rand -base64 32   # → MASTER_ENCRYPTION_KEY
openssl rand -hex 32      # → PII_HASH_PEPPER

docker compose -f docker/docker-compose.dev.yml up -d
pnpm install
pnpm db:migrate
pnpm db:seed              # registra tu primera custom app + formulario base
```

Producción (VPS):

```bash
docker compose -f docker/docker-compose.prod.yml up -d
```

## Añadir una tienda nueva (Camino A)

1. Crear una custom app en el Partner Dashboard de esa tienda.
2. Copiar `shopify.app.toml` cambiando `client_id`.
3. Insertar la fila en `ShopifyApp` (el seed tiene un helper).
4. Instalar. El backend ya es multi-tenant: no se toca nada más.

## Reglas no negociables

- **Los precios los pone el servidor.** `clientTotals` solo sirve para detectar manipulación.
- **Ninguna query sin `shopId`.** El aislamiento entre tiendas es absoluto.
- **La API key de Google vive en el backend.** La del navegador es otra, restringida por dominio y solo con Maps JS.
- **Respondemos al cliente ANTES de llamar a Shopify.** Una caída de Shopify no puede costarnos una venta.

## Fase 3 ampliada (botones, WhatsApp, confirmación editable)

- **Botón «Comprar ahora» (trigger)**: ancho, alto, tamaño de título y descripción,
  colores, redondeo, icono (emoji o imagen propia), animación (latido/brillo/rebote)
  y hasta 5 **descripciones rotativas** con intervalo configurable. Se usa en modo popup.
- **Botón «Finalizar pedido» (submit)**: tamaño, texto, icono, animación, color normal
  y **color al completarse** — todo editable en Diseño.
- **Texto de confirmación editable** (título y mensaje) desde Ajustes.
- **Redirección post-pedido configurable**: página de gracias del tema, **conversación
  de WhatsApp** (número + mensaje predeterminado con variables {nombre} {telefono}),
  o quedarse en la confirmación.
- Modo **popup**: `data-mode="popup"` en el bloque del tema muestra el botón trigger
  que abre el formulario en un modal.

Pendiente aún: modo carrito (leer /cart.js), upsells/downsells, Meta CAPI (Fase 7).

## Fase 4 (AOV: upsells, order bumps, downsells)

- **Order bump**: casilla de un clic dentro del formulario ("añade la garantía por RD$290").
- **Upsell**: tarjeta con imagen, precio y botón Añadir/Quitar.
- **Downsell**: aparece solo si el cliente rechaza el upsell al que está asociado.
- Todos apuntan a una **variante real de Shopify**; el precio se **re-valida en Shopify**
  al cotizar y al crear el pedido (nadie compra un extra caro por RD$1 editando el DOM).
- Se guardan como filas `Offer` (type UPSELL/ORDER_BUMP/DOWNSELL) → **sin migración**.
- Los addons aceptados entran como **líneas extra del pedido** en `orderCreate`.
- El total (widget y servidor) los suma, y cuentan para el envío gratis por umbral.
- Panel: se crean desde **Ofertas y descuentos → Upsells y order bumps**, con take-rate.

Pendiente aún: modo carrito (leer /cart.js), Meta CAPI (Fase 7), envíos por zona (Fase 6).

## Fase 5 (anti-fraude avanzado)

⚠️ Requiere migración: `pnpm db:migrate` (añade estados HELD y REJECTED a Submission).

- **Cola de confirmación manual**: si un pedido supera el umbral de riesgo y activas
  la retención, NO se envía a Shopify automáticamente. Queda en estado HELD, en
  «Pedidos → En revisión», donde lo apruebas (se encola) o lo rechazas (con opción
  de bloquear el teléfono). El cliente ve su confirmación igual; no sabe que está en revisión.
- **Lista de bloqueo** (menú «Lista de bloqueo»): bloquea por teléfono, IP, correo o
  provincia. El valor se guarda hasheado (HMAC + pepper), igual que en el submit, así
  que casa sin exponer PII.
- **Límite de pedidos por teléfono al día**: tope duro configurable (0 = sin límite).
- **Turnstile (CAPTCHA)**: campos de site key / secret en Ajustes. Vacío = desactivado.

OTP sigue sin implementarse (decisión del proyecto), cableado con NoopOtpProvider.
Pendiente: Meta CAPI (Fase 7), envíos por zona (Fase 6), modo carrito.

## Fase 6 (envíos por provincia + COD fee)

Sin migración (solo cambia el JSON de settings).

- **Tarifa por provincia**: en «Envíos» pones un precio distinto por cada provincia de RD.
  Las que dejes en blanco usan la tarifa general. Resuelto en el pricing según la
  provincia declarada por el cliente.
- **COD fee**: recargo configurable por pagar contra entrega, con nombre editable.
  Aparece como línea aparte en el pedido de Shopify para que el desglose sea claro.
- El envío gratis por umbral sigue mandando sobre la tarifa provincial.
- Ambos se aplican al total real del pedido (no se muestran al cliente, coherente con
  la decisión de no enseñarle el resumen).

Pendiente: Meta CAPI + analítica (Fase 7), modo carrito, endurecimiento (Fase 8).
El árbol completo zona→municipio→sector se puede añadir después; hoy es por provincia,
que cubre el 95% de los casos en RD.

## Fase 7 (Meta CAPI + analítica) — la que hace funcionar las campañas

- **Evento de compra doble**: píxel del navegador (fbq/ttq) + **Conversions API
  server-side**, con el MISMO eventId → Meta deduplica. El server-side es el que
  cuenta: iOS y los ad-blockers matan el píxel.
- **CAPI por outbox**: se dispara al confirmar el pedido, con reintentos. Un fallo
  de Meta no afecta la creación del pedido.
- **PII hasheada (SHA-256)** antes de salir, como exige Meta.
- **SEGURIDAD**: el token del CAPI y los secretos NUNCA van al navegador
  (forms.service los saca con publicSettings). Solo salen los IDs de píxel (públicos).
- Soporta **Meta, TikTok Events API y GA4 Measurement Protocol**.
- **Embudo** (pantalla Analítica): vistas → inicios → envíos → confirmados, con
  ingreso, conversión y % de pedidos con GPS. Eventos por sendBeacon (no bloquean).
- Configuración de píxeles en Ajustes → Tracking.

Pendiente: modo carrito, endurecimiento (Fase 8), export a Sheets, abandono por WhatsApp.

## Fase 8 (endurecimiento) — última fase

⚠️ Requiere migración: `pnpm db:migrate` (añade `label` a FormAssignment).

- **Asignación funcional de formularios**: por producto, colección, etiqueta o proveedor,
  con **Resource Picker de App Bridge** (elegir producto/colección sin pegar IDs a mano).
  El widget resuelve por especificidad: producto > colección > tag > proveedor > todos.
- **Export de pedidos a CSV** (botón en Pedidos): se abre en Sheets o Excel. Se eligió
  CSV en vez de la Sheets API para no gestionar OAuth de Google; la sincronización
  automática se puede añadir después como conector.
- La query de producto ahora trae vendor, tags y colecciones para resolver asignaciones.

### Estado final del proyecto
Fases 0-8 completas. Pendientes opcionales, fuera del plan original:
- Modo carrito (leer /cart.js) — cambio de arquitectura, conviene tras validar en dev store.
- Sincronización automática con Google Sheets (hoy: export CSV manual).
- Recuperación de abandonos por WhatsApp/SMS.
- Migración del mapa a Google Maps JS (hoy: tiles OSM tras adapter).
- Árbol de envío provincia>municipio>sector (hoy: por provincia).

### ANTES DE PRODUCCIÓN
Nada de esto está probado contra la API real de Shopify. El primer paso sigue siendo
instalar en una dev store con `shopify app dev` y crear un pedido de prueba: si algo
falla será el provinceCode en orderCreate. Es más barato descubrirlo antes de escalar.
