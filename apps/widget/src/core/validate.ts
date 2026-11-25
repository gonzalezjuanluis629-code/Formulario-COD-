import type { Field } from '@cod/contracts';

/**
 * MISMAS reglas que el servidor: ambos leen el `Field` de @cod/contracts.
 * El cliente valida para dar feedback instantáneo; la verdad está en el backend.
 */
export function validateField(f: Field, value: string): string | null {
  const v = (value ?? '').trim();

  if (f.type === 'location') {
    return f.required && !v ? 'Elige cómo darnos tu dirección: tu ubicación o escribirla.' : null;
  }
  if (f.type === 'checkbox') {
    return f.required && v !== 'true' ? 'Marca esta casilla para continuar.' : null;
  }
  if (f.required && !v) return `${f.label || 'Este campo'} es obligatorio.`;
  if (!v) return null;

  const { minLength, maxLength, regex, message } = f.validation;
  if (minLength != null && v.length < minLength) return message ?? `Mínimo ${minLength} caracteres.`;
  if (maxLength != null && v.length > maxLength) return message ?? `Máximo ${maxLength} caracteres.`;
  if (regex && !new RegExp(regex).test(v)) return message ?? 'Formato no válido.';

  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Revisa el correo.';
  if (f.type === 'phone' && !validPhone(v)) {
    return 'Número no válido. Escribe los 10 dígitos (809, 829, 849 o de EE. UU.).';
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

/**
 * Teléfono aceptado: República Dominicana (809/829/849) o Estados Unidos y
 * Canadá (+1). Mismo plan de numeración (NANP): 10 dígitos, el código de área
 * y la central no empiezan por 0 ni 1. El 1 del país se quita si lo pegan.
 */
export function validPhone(v: string): boolean {
  let d = v.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) && !/^[2-9]11/.test(d);
}
