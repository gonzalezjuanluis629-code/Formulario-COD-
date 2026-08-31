import type { MapController } from './location';

/**
 * Renderizador de mapa. Deliberadamente detrás de una interfaz:
 * hoy son tiles OSM (cero coste, cero SDK); mañana es Google Maps JS
 * cambiando SOLO este archivo. El resto del widget ni se entera.
 *
 * El pin va FIJO en el centro y se mueve el mapa (patrón Uber/PedidosYa):
 * en una pantalla de 160 px es mucho más usable con el dedo que arrastrar
 * un pin de 26 px.
 */
export function createMap(
  el: HTMLElement,
  opts: { lat: number; lng: number; zoom: number; onMove: (lat: number, lng: number) => void },
): MapController {
  const tiles = el.querySelector<HTMLElement>('.cod-map-tiles')!;
  const acc = el.querySelector<HTMLElement>('.cod-map-acc')!;

  let z = opts.zoom;
  let cx = lngToPx(opts.lng, z);
  let cy = latToPx(opts.lat, z);
  let editing = false;
  let accuracy = 0;

  render();

  /* ── Arrastre: SOLO en edición. rAF + translate3d: 1 pintado por frame. ── */
  let dragging = false, sx = 0, sy = 0, dx = 0, dy = 0, raf = 0;

  const paint = () => { raf = 0; tiles.style.transform = `translate3d(${dx}px,${dy}px,0)`; };

  const down = (e: MouseEvent | TouchEvent) => {
    if (!editing) return;             // bloqueado: el dedo hace scroll, no mueve el pin
    dragging = true; dx = dy = 0;
    const t = 'touches' in e ? e.touches[0]! : e;
    sx = t.clientX; sy = t.clientY;
    el.classList.add('cod-grabbing');
    e.preventDefault();
  };
  const move = (e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    const t = 'touches' in e ? e.touches[0]! : e;
    dx = t.clientX - sx; dy = t.clientY - sy;
    if (!raf) raf = requestAnimationFrame(paint);
    e.preventDefault();
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('cod-grabbing');
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    cx -= dx; cy -= dy;
    accuracy = 0;                     // ajustado a mano: ya no es precisión GPS
    render();
    opts.onMove(pxToLat(cy, z), pxToLng(cx, z));
  };

  el.addEventListener('mousedown', down);
  el.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mousemove', move, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', up);
  window.addEventListener('touchend', up);

  function render(): void {
    const w = el.clientWidth || 320;
    const h = el.clientHeight || 160;
    const ox = cx - w / 2, oy = cy - h / 2;
    const max = 2 ** z;

    const frag = document.createDocumentFragment(); // 1 reflow, no doce
    for (let x = Math.floor(ox / 256); x <= Math.floor((ox + w) / 256); x++) {
      for (let y = Math.floor(oy / 256); y <= Math.floor((oy + h) / 256); y++) {
        if (y < 0 || y >= max) continue;
        const img = new Image();
        img.src = `https://tile.openstreetmap.org/${z}/${((x % max) + max) % max}/${y}.png`;
        img.decoding = 'async';
        img.alt = '';
        img.style.cssText = `left:${x * 256 - ox}px;top:${y * 256 - oy}px`;
        frag.appendChild(img);
      }
    }
    tiles.textContent = '';
    tiles.appendChild(frag);
    tiles.style.transform = 'translate3d(0,0,0)';
    drawAccuracy();
  }

  function drawAccuracy(): void {
    if (!accuracy) { acc.style.width = acc.style.height = '0px'; return; }
    const lat = pxToLat(cy, z);
    const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
    const d = Math.min(130, Math.max(26, (accuracy / mpp) * 2));
    acc.style.width = acc.style.height = `${d}px`;
  }

  return {
    setEditing(on: boolean) {
      editing = on;
      el.classList.toggle('cod-map-locked', !on);
      el.classList.toggle('cod-map-editing', on);
    },
    isEditing: () => editing,
    setAccuracy(m: number) { accuracy = m; drawAccuracy(); },
  };
}

/* Proyección Web Mercator (la misma que usan Google, OSM y Mapbox). */
const lngToPx = (l: number, z: number) => ((l + 180) / 360) * 2 ** z * 256;
const latToPx = (l: number, z: number) => {
  const r = (l * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * 256;
};
const pxToLng = (x: number, z: number) => (x / (2 ** z * 256)) * 360 - 180;
const pxToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z * 256);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
