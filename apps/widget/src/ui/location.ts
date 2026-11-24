import type { WidgetConfig } from '@cod/contracts';
import type { FormState } from '../index';
import { api } from '../core/api';

/**
 * Módulo de ubicación: 2 opciones (GPS / escribirla).
 *
 * Reglas de UX que ya validamos en el prototipo:
 * - El mapa nace BLOQUEADO. Con el dedo haciendo scroll no se puede mover el
 *   pin sin querer: `touch-action:pan-y` + los listeners salen si no se está
 *   editando. Solo "Editar ubicación" lo desbloquea.
 * - Si el permiso se deniega, se pasa SOLO al modo escrito. Nunca un callejón sin salida.
 * - El mapa (chunk aparte) se descarga solo al pulsar GPS.
 */
export function mountLocation(
  wrap: HTMLElement,
  config: WidgetConfig,
  state: FormState,
  onChange: () => void,
): void {
  const c = config.location;

  wrap.innerHTML = `
    <label>Dirección de entrega <span class="cod-req">*</span></label>
    <div class="cod-seg" role="radiogroup">
      <span class="cod-glider"></span>
      ${c.gpsEnabled ? `
      <button type="button" class="cod-seg-btn" data-mode="gps" role="radio" aria-checked="false">
        <span class="cod-seg-tag">★ Recomendado</span>
        <span class="cod-seg-ico"><span class="cod-spinner-sm"></span></span>
        <b>${esc(c.gpsLabel)}</b><small>${esc(c.gpsHint)}</small>
      </button>` : ''}
      ${c.manualEnabled ? `
      <button type="button" class="cod-seg-btn" data-mode="manual" role="radio" aria-checked="false">
        <span class="cod-seg-ico"></span>
        <b>${esc(c.manualLabel)}</b><small>${esc(c.manualHint)}</small>
      </button>` : ''}
    </div>

    <div class="cod-map-panel" hidden>
      <div class="cod-map cod-map-locked"><div class="cod-map-tiles"></div>
        <div class="cod-map-acc"></div><div class="cod-map-pin"></div>
        <span class="cod-map-lock">Ubicación fijada</span>
        <div class="cod-map-zoom"><button type="button" data-z="1" aria-label="Acercar">+</button><button type="button" data-z="-1" aria-label="Alejar">−</button></div>
      </div>
      <div class="cod-locbar"><b class="cod-loc-addr">Ubicación marcada</b><span class="cod-loc-coords"></span></div>
      <button type="button" class="cod-edit-btn">Editar ubicación</button>
    </div>

    <div class="cod-manual-panel" hidden></div>
    <span class="cod-err"></span>`;

  const segs = wrap.querySelectorAll<HTMLButtonElement>('.cod-seg-btn');
  const mapPanel = wrap.querySelector<HTMLElement>('.cod-map-panel')!;
  const manualPanel = wrap.querySelector<HTMLElement>('.cod-manual-panel')!;
  const errEl = wrap.querySelector<HTMLElement>('.cod-err')!;

  let map: MapController | null = null;
  // Clave del campo en el formulario. Su valor ('gps' | 'manual') es lo que
  // cuenta como "respondido" para el obligatorio y la barra de progreso, y
  // `locationMode` es lo que usan las reglas condicionales (provincia, dirección…).
  const key = wrap.dataset.key || 'location';
  const setValue = (v: string) => {
    if (v) state.values[key] = v; else delete state.values[key];
  };

  segs.forEach((btn) => {
    btn.addEventListener('click', () => void setMode(btn.dataset.mode as 'gps' | 'manual'));
  });

  async function setMode(mode: 'gps' | 'manual') {
    wrap.querySelector('.cod-seg')!.setAttribute('data-active', mode);
    segs.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    errEl.textContent = '';
    errEl.classList.remove('cod-soft');
    wrap.classList.remove('cod-invalid');
    state.values.locationMode = mode;

    if (mode === 'manual') {
      mapPanel.hidden = true;
      manualPanel.hidden = false;
      state.location = null;
      setValue('manual');
      onChange();
      return;
    }

    manualPanel.hidden = true;
    setValue('');
    onChange();
    await locate();
  }

  async function locate() {
    const gpsBtn = wrap.querySelector<HTMLElement>('[data-mode="gps"]')!;
    gpsBtn.classList.add('cod-locating');

    wrap.classList.remove('cod-picking');
    let pos: GeolocationPosition;
    try {
      pos = await getPosition();
      report(config, 'ok');
    } catch (e) {
      const err = e as GeolocationPositionError;
      report(config, failCode(err));
      gpsBtn.classList.remove('cod-locating');
      // El teléfono no dio la ubicación (permiso negado, Facebook/Instagram no la
      // deja usar, tardó…). En vez de mandarlo a escribirla, se le abre el mapa
      // para que marque su casa con el dedo. «Escribirla» sigue ahí.
      if (await pickOnMap(err)) return;
      await setMode('manual');
      errEl.textContent = await whyNoLocation(err, ' Mientras, escribe tu dirección aquí abajo.');
      errEl.classList.add('cod-soft');
      return;
    }

    try {
      // El mapa solo se descarga AHORA. El bundle base no lo paga.
      const { createMap } = await import('./map');

      mapPanel.hidden = false;
      map?.destroy();
      resetEdit();
      map = createMap(wrap.querySelector('.cod-map')!, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        zoom: config.location.defaultZoom,
        onMove: (lat, lng) => {
          state.location = {
            lat, lng, accuracyMeters: null,
            source: 'MAP_PIN', capturedAt: new Date().toISOString(),
          };
          void reverse(lat, lng);
          onChange();
        },
      });

      state.location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Math.round(pos.coords.accuracy),
        source: 'GPS',
        capturedAt: new Date().toISOString(),
      };
      map.setAccuracy(pos.coords.accuracy);
    } catch {
      // Si el mapa no carga, la ubicación GPS igual vale.
      state.location = {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        accuracyMeters: Math.round(pos.coords.accuracy), source: 'GPS', capturedAt: new Date().toISOString(),
      };
    } finally {
      setValue('gps');
      void reverse(pos.coords.latitude, pos.coords.longitude);
      onChange();
      gpsBtn.classList.remove('cod-locating');
    }
  }

  /**
   * Marcar la casa en el mapa a mano (sin GPS): el mapa abre en el país, se
   * acerca con + y se mueve con el dedo. Solo vale cuando ya se ve la calle
   * (zoom ≥ PICK_MIN_ZOOM): antes, la ubicación quedaría a kilómetros.
   */
  async function pickOnMap(err: GeolocationPositionError): Promise<boolean> {
    let createMap: typeof import('./map').createMap;
    try { ({ createMap } = await import('./map')); } catch { return false; }
    const addrEl = wrap.querySelector<HTMLElement>('.cod-loc-addr')!;
    const coordsEl = wrap.querySelector<HTMLElement>('.cod-loc-coords')!;
    wrap.classList.add('cod-picking');
    mapPanel.hidden = false;
    state.location = null;
    setValue('');
    const tip = 'Acércalo con + y muévelo a tu casa';
    addrEl.textContent = tip;
    coordsEl.textContent = '';
    errEl.textContent = await whyNoLocation(err, ' Márcala en el mapa o toca «' + c.manualLabel + '».');
    errEl.classList.add('cod-soft');
    const mapEl = wrap.querySelector<HTMLElement>('.cod-map')!;
    map?.destroy();
    map = createMap(mapEl, {
      lat: COUNTRY_CENTER.lat, lng: COUNTRY_CENTER.lng, zoom: COUNTRY_ZOOM,
      onMove: (lat, lng) => {
        if ((map?.zoom() ?? 0) < PICK_MIN_ZOOM) {
          state.location = null;
          setValue('');
          addrEl.textContent = 'Acércalo más (+) hasta ver tu calle';
          coordsEl.textContent = '';
          onChange();
          return;
        }
        state.location = { lat, lng, accuracyMeters: null, source: 'MAP_PIN', capturedAt: new Date().toISOString() };
        setValue('gps');
        errEl.textContent = '';
        void reverse(lat, lng);
        onChange();
      },
    });
    map.setEditing(true);
    const edit = wrap.querySelector<HTMLButtonElement>('.cod-edit-btn')!;
    edit.textContent = 'Guardar ubicación';
    edit.classList.add('cod-saving');
    onChange();
    return true;
  }

  function resetEdit() {
    const edit = wrap.querySelector<HTMLButtonElement>('.cod-edit-btn')!;
    edit.textContent = 'Editar ubicación';
    edit.classList.remove('cod-saving');
  }

  wrap.querySelectorAll<HTMLButtonElement>('.cod-map-zoom button').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      map?.zoomBy(Number(b.dataset.z));
    });
  });

  /** El backend llama a Google; el navegador nunca ve la API key. */
  async function reverse(lat: number, lng: number) {
    const addrEl = wrap.querySelector<HTMLElement>('.cod-loc-addr')!;
    const coordsEl = wrap.querySelector<HTMLElement>('.cod-loc-coords')!;
    coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    addrEl.textContent = 'Buscando dirección…';

    try {
      const r = await api.reverse(lat, lng);
      addrEl.textContent = r.formatted ?? 'Ubicación marcada';
      // Los campos ocultos que el backend usará para la dirección de Shopify.
      if (r.provinceCode) state.values.provinceCode = r.provinceCode;
      if (r.city) state.values.city = r.city;
      if (r.district) state.values.sector = r.district;
      if (r.street) state.values.street = [r.street, r.number].filter(Boolean).join(' ');
      // La provincia del mapa decide qué ofertas y extras salen (y el envío).
      onChange();
    } catch {
      addrEl.textContent = 'Ubicación marcada'; // el fallo del geocoder JAMÁS bloquea el pedido
    }
  }

  /* Editar / guardar: el único camino para mover el pin. */
  wrap.querySelector('.cod-edit-btn')!.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const on = !map?.isEditing();
    map?.setEditing(on);
    btn.textContent = on ? 'Guardar ubicación' : 'Editar ubicación';
    btn.classList.toggle('cod-saving', on);
  });
}

/** Mensaje claro según la causa real (el navegador a veces niega sin preguntar). */
async function whyNoLocation(e: GeolocationPositionError | Error | undefined, tail: string): Promise<string> {
  const inFrame = (() => { try { return window.top !== window.self; } catch { return true; } })();
  const policy = (document as Document & { featurePolicy?: { allowsFeature(f: string): boolean } }).featurePolicy;
  if (inFrame && policy && !policy.allowsFeature('geolocation')) {
    return 'La vista previa del editor no permite pedir la ubicación. Pruébalo en la tienda (botón «Ver tienda»).' + tail;
  }
  if (!navigator.geolocation || !window.isSecureContext) return 'Este navegador no permite usar la ubicación.' + tail;
  const code = (e as GeolocationPositionError | undefined)?.code;
  const app = inAppBrowser();
  if (code === 1 && app) {
    return `${app === 'ig' ? 'Instagram' : 'Facebook'} no dejó usar tu ubicación.` + tail;
  }
  if (code === 1) {
    let state = '';
    try { state = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { /* sin API */ }
    return (state === 'denied'
      ? 'La ubicación está bloqueada para esta tienda. Actívala tocando el candado junto a la dirección de la página.'
      : 'No se dio permiso para usar tu ubicación.') + tail;
  }
  if (code === 2) return 'No se pudo saber tu ubicación. Revisa que la ubicación esté activada en tu teléfono o computadora.' + tail;
  if (code === 3) return 'La ubicación tardó demasiado. Inténtalo otra vez.' + tail;
  return 'Sin acceso a tu ubicación.' + tail;
}

/** Centro del país (República Dominicana) para marcar la casa a mano. */
const COUNTRY_CENTER = { lat: 18.82, lng: -70.3 };
const COUNTRY_ZOOM = 8;
/** Desde este zoom ya se ven las calles: la ubicación marcada vale. */
const PICK_MIN_ZOOM = 15;

/**
 * Pedir la ubicación. Primero precisa (GPS); si el GPS tarda o no responde
 * (dentro de una casa pasa mucho), se pide la aproximada (wifi/antenas), que
 * casi siempre llega. Una ubicación de hace un par de minutos también vale.
 */
async function getPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) throw new Error('sin soporte');
  const ask = (o: PositionOptions) => new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, o);
  });
  try {
    return await ask({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 120_000 });
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) throw e; // permiso negado: no se insiste
    return ask({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }
}

/** Navegador dentro de Facebook o Instagram (de ahí viene casi todo el tráfico de anuncios). */
function inAppBrowser(): 'fb' | 'ig' | null {
  const ua = navigator.userAgent || '';
  if (/Instagram/i.test(ua)) return 'ig';
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua)) return 'fb';
  return null;
}

function failCode(e: GeolocationPositionError | Error | undefined): string {
  const code = (e as GeolocationPositionError | undefined)?.code;
  if (!navigator.geolocation || !window.isSecureContext) return 'unsupported';
  return code === 1 ? 'denied' : code === 2 ? 'unavailable' : code === 3 ? 'timeout' : 'error';
}

/**
 * Cuenta cómo le fue a cada cliente al pedir la ubicación (sin datos
 * personales): «denied:ig-ios», «ok:fb-android»… Así se ve en los registros
 * por qué la gente no usa el mapa.
 */
function report(config: WidgetConfig, outcome: string): void {
  try {
    const inFrame = (() => { try { return window.top !== window.self; } catch { return true; } })();
    if (inFrame) return; // vista previa del editor
    const ua = navigator.userAgent || '';
    const os = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
    api.track(config.formId, 'location', config.formVersionId, `${outcome}:${inAppBrowser() ?? 'web'}-${os}`);
  } catch { /* nunca bloquea */ }
}

export interface MapController {
  setEditing(on: boolean): void;
  isEditing(): boolean;
  setAccuracy(m: number): void;
  zoom(): number;
  zoomBy(d: number): void;
  destroy(): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
