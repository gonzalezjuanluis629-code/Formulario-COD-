import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * Modo oscuro del editor dentro de Figui. Figui manda el modo en la URL
 * (?theme=dark) y luego por mensaje cuando cambia; aquí se guarda en la
 * pestaña y se marca <html class="cod-dark">.
 */
export const COD_THEME_EVENT = 'cod-theme';

export function isCodDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('cod-dark');
}

export function setCodDark(dark: boolean): void {
  document.documentElement.classList.toggle('cod-dark', dark);
  try { sessionStorage.setItem('cod-theme', dark ? 'dark' : 'light'); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(COD_THEME_EVENT));
}

const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** true si el editor está en oscuro (se actualiza cuando Figui cambia el modo). */
export function useCodDark(): boolean {
  const [dark, setDark] = useState(false);
  useIsoLayout(() => {
    const sync = () => setDark(isCodDark());
    sync();
    window.addEventListener(COD_THEME_EVENT, sync);
    return () => window.removeEventListener(COD_THEME_EVENT, sync);
  }, []);
  return dark;
}

/** Se ejecuta antes de pintar: sin destello claro al abrir en oscuro. */
export const COD_THEME_BOOT = `(function(){document.documentElement.classList.add('cod-figui');try{var q=new URLSearchParams(location.search).get('theme');if(q==='dark'||q==='light')sessionStorage.setItem('cod-theme',q);var d=(q||sessionStorage.getItem('cod-theme'))==='dark';var h=document.documentElement;h.classList.toggle('cod-dark',d);if(d){h.classList.add('p-theme-dark-experimental');h.classList.remove('p-theme-light');}}catch(e){}})();`;
