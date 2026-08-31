import type { Field } from '@cod/contracts';

/**
 * MISMAS reglas que el servidor: ambos leen el `Field` de @cod/contracts.
 * El cliente valida para dar feedback instantáneo; la verdad está en el backend.
 */
export function validateField(f: Field, value: string): string | null {
  const v = (value ?? '').trim();

  if (f.required && !v) return `${f.label || 'Este campo'} es obligatorio.`;
  if (!v) return null;

  const { minLength, maxLength, regex, message } = f.validation;
  if (minLength != null && v.length < minLength) return message ?? `Mínimo ${minLength} caracteres.`;
  if (maxLength != null && v.length > maxLength) return message ?? `Máximo ${maxLength} caracteres.`;
  if (regex && !new RegExp(regex).test(v)) return message ?? 'Formato no válido.';

  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Revisa el correo.';
  if (f.type === 'phone' && !/^(809|829|849)\d{7}$/.test(v.replace(/\D/g, ''))) {
    return 'Número no válido (809, 829 u 849).';
  }
  return null;
}

/** Reglas condicionales: "si provincia = X, muestra el campo Y". */
export function isVisible(f: Field, values: Record<string, string>): boolean {
  if (!f.visible) return false;
  return f.conditions.every((c) => {
    const v = values[c.field] ?? '';
    switch (c.op) {
      case 'eq': return v === String(c.value);
      case 'neq': return v !== String(c.value);
      case 'contains': return v.includes(String(c.value));
      case 'empty': return v === '';
      case 'notEmpty': return v !== '';
      case 'gt': return Number(v) > Number(c.value);
      case 'gte': return Number(v) >= Number(c.value);
      case 'lt': return Number(v) < Number(c.value);
      case 'lte': return Number(v) <= Number(c.value);
      default: return true;
    }
  });
}
