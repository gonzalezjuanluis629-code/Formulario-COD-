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
  // El mapa (y la conexión a sus imágenes) se prepara en cuanto se ve el campo:
  // al tocar «Usar mi ubicación», lo único que falta es el permiso.
  const mapModule = preloadMap();
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
    const hint = gpsBtn.querySelector('small');
    const hintText = hint?.textContent ?? '';
    if (hint) hint.textContent = 'Buscando tu ubicación…';
    const done = () => { gpsBtn.classList.remove('cod-locating'); if (hint) hint.textContent = hintText; };

    let pos: GeolocationPosition;
    try {
      // La primera ubicación que llegue (la aproximada sale en ~1 s); la
      // exacta del GPS la va afinando después sin que el cliente espere.
      pos = await fastPosition((better) => refine(better));
      report(config, 'ok');
    } catch (e) {
      // Sin ubicación (permiso negado, Facebook/Instagram no la deja usar…):
      // se pasa al modo escrito, diciendo POR QUÉ.
      const err = e as GeolocationPositionError;
      report(config, failCode(err));
      done();
      await setMode('manual');
      errEl.textContent = await whyNoLocation(err, ' Escribe tu dirección aquí abajo.');
      errEl.classList.add('cod-soft');
      return;
    }

    try {
      const { createMap } = await mapModule;
      mapPanel.hidden = false;
      map?.destroy();
      resetEdit();
      map = createMap(wrap.querySelector('.cod-map')!, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        zoom: config.location.defaultZoom,
        onMove: (lat, lng) => {
          moved = true; // el cliente ajustó el pin: el GPS ya no lo mueve
          state.location = {
            lat, lng, accuracyMeters: null,
            source: 'MAP_PIN', capturedAt: new Date().toISOString(),
          };
          void reverse(lat, lng);
          onChange();
        },
      });
      map.setAccuracy(pos.coords.accuracy);
    } catch { /* si el mapa no carga, la ubicación igual vale */ }
    moved = false;
    setGps(pos);
    setValue('gps');
    void reverse(pos.coords.latitude, pos.coords.longitude);
    onChange();
    done();
  }

  function resetEdit() {
    const edit = wrap.querySelector<HTMLButtonElement>('.cod-edit-btn')!;
    edit.textContent = 'Editar ubicación';
    edit.classList.remove('cod-saving');
  }

  let moved = false;
  let last: { lat: number; lng: number } | null = null;
  function setGps(pos: GeolocationPosition) {
    state.location = {
      lat: pos.coords.latitude, lng: pos.coords.longitude,
      accuracyMeters: Math.round(pos.coords.accuracy), source: 'GPS', capturedAt: new Date().toISOString(),
    };
    last = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }
  /** Llegó una ubicación más exacta: se centra el mapa ahí (si el cliente no movió el pin). */
  function refine(pos: GeolocationPosition) {
    if (moved || state.values.locationMode !== 'gps' || !state.location) return;
    const prev = last;
    setGps(pos);
    map?.setView(pos.coords.latitude, pos.coords.longitude);
    map?.setAccuracy(pos.coords.accuracy);
    if (!prev || metersBetween(prev.lat, prev.lng, pos.coords.latitude, pos.coords.longitude) > 60) {
      void reverse(pos.coords.latitude, pos.coords.longitude);
    }
    onChange();
  }

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

/**
 * Ubicación lo más rápido posible:
 *  - La aproximada (wifi/antenas, o una de hace unos minutos) responde casi al
 *    instante después del permiso: con esa se muestra el mapa.
 *  - A la vez el GPS busca la exacta y, cuando llega, se avisa con onBetter
 *    (hasta 15 s o hasta tener ≤ 25 m).
 * Falla solo si se niega el permiso o si ninguna de las dos responde.
 */
function fastPosition(onBetter: (p: GeolocationPosition) => void): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const geo = navigator.geolocation;
    if (!geo) return reject(new Error('sin soporte'));
    let first: GeolocationPosition | null = null;
    let fails = 0;
    let lastErr: GeolocationPositionError | null = null;
    let watchId: number | null = null;
    const stop = () => { if (watchId !== null) { geo.clearWatch(watchId); watchId = null; } };
    const ok = (p: GeolocationPosition) => {
      if (!first) { first = p; resolve(p); }
      else if (p.coords.accuracy < first.coords.accuracy - 5) { first = p; onBetter(p); }
      if (p.coords.accuracy <= 25) stop();
    };
    const fail = (e: GeolocationPositionError) => {
      lastErr = e;
      if (e.code === 1) { stop(); if (!first) reject(e); return; } // permiso negado: no se insiste
      if (++fails >= 2 && !first) { stop(); reject(lastErr); }
    };
    geo.getCurrentPosition(ok, fail, { enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 });
    try {
      watchId = geo.watchPosition(ok, (e) => { if (e.code !== 3 || !first) fail(e); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    } catch { fails++; }
    setTimeout(stop, 20_000);
  });
}

/** El mapa en segundo plano y la conexión a sus imágenes abierta de antemano. */
function preloadMap(): Promise<typeof import('./map')> {
  try {
    if (!document.querySelector('link[data-cod-tiles]')) {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = 'https://tile.openstreetmap.org'; l.crossOrigin = 'anonymous';
      l.setAttribute('data-cod-tiles', '');
      document.head.appendChild(l);
    }
  } catch { /* nada */ }
  return new Promise((resolve, reject) => {
    const go = () => import('./map').then(resolve, reject);
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(go, { timeout: 1500 }); else setTimeout(go, 300);
  });
}

function metersBetween(a: number, b: number, c: number, d: number): number {
  const R = 6371000, toR = Math.PI / 180;
  const x = (d - b) * toR * Math.cos(((a + c) / 2) * toR), y = (c - a) * toR;
  return Math.sqrt(x * x + y * y) * R;
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
  setView(lat: number, lng: number): void;
  destroy(): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
