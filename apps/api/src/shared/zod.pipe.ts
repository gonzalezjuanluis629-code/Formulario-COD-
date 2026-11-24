import { BadRequestException, Logger, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Nada entra al dominio sin pasar por aquí. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      // Al registro solo QUÉ campo falló (nunca el valor: son datos del cliente).
      new Logger('Validacion').warn(`Datos inválidos: ${r.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(raíz)'} → ${i.message}`).join(' · ')}`);
      throw new BadRequestException({
        message: 'Datos inválidos',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
