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

  segs.forEach((btn) => {
    btn.addEventListener('click', () => void setMode(btn.dataset.mode as 'gps' | 'manual'));
  });

  async function setMode(mode: 'gps' | 'manual') {
    wrap.querySelector('.cod-seg')!.setAttribute('data-active', mode);
    segs.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    errEl.textContent = '';

    if (mode === 'manual') {
      mapPanel.hidden = true;
      manualPanel.hidden = false;
      state.location = null;
      onChange();
      return;
    }

    manualPanel.hidden = true;
    await locate();
  }

  async function locate() {
    const gpsBtn = wrap.querySelector<HTMLElement>('[data-mode="gps"]')!;
    gpsBtn.classList.add('cod-locating');

    try {
      const pos = await getPosition();

      // El mapa solo se descarga AHORA. El bundle base no lo paga.
      const { createMap } = await import('./map');

      mapPanel.hidden = false;
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
      void reverse(pos.coords.latitude, pos.coords.longitude);
      onChange();
    } catch {
      // Sin ubicación no se bloquea a nadie: se pasa solo al modo escrito.
      await setMode('manual');
      errEl.textContent = 'Sin acceso a tu ubicación. Escribe tu dirección aquí abajo.';
      errEl.classList.add('cod-soft');
    } finally {
      gpsBtn.classList.remove('cod-locating');
    }
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

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('sin soporte'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 0,
    });
  });
}

export interface MapController {
  setEditing(on: boolean): void;
  isEditing(): boolean;
  setAccuracy(m: number): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
