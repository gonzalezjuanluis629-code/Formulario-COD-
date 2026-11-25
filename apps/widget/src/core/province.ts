/**
 * ¿Una oferta o extra sale en esta provincia? Copia de provinceAllows de
 * @cod/contracts: importarla desde allí metía en el formulario toda la
 * librería de validación del servidor (zod, ~45 KB comprimidos).
 */
export function provinceAllows(rule: { mode?: 'all' | 'only' | 'except'; codes?: string[] } | null | undefined, province: string | null | undefined): boolean {
  const mode = rule?.mode ?? 'all';
  const codes = rule?.codes ?? [];
  if (mode === 'all' || !codes.length) return true;
  const p = (province ?? '').trim().toUpperCase();
  if (mode === 'only') return !!p && codes.includes(p);
  return !p || !codes.includes(p);
}
