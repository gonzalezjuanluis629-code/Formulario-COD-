/**
 * OTP NO se implementa (decisión del proyecto), pero queda cableado para que
 * activarlo mañana sea escribir UNA clase y encender un flag.
 * Cero cambios en el dominio, en el widget o en la base de datos.
 */
export interface IOtpProvider {
  readonly name: string;
  isRequired(riskScore: number): boolean;
  send(phoneE164: string): Promise<void>;
  verify(phoneE164: string, code: string): Promise<boolean>;
}

export class NoopOtpProvider implements IOtpProvider {
  readonly name = 'noop';
  isRequired(): boolean { return false; }
  async send(): Promise<void> { throw new Error('OTP no habilitado'); }
  async verify(): Promise<boolean> { return true; }
}

/* Mañana:
 * export class TwilioOtpProvider implements IOtpProvider { … }
 * y en el módulo: { provide: 'OTP', useClass: TwilioOtpProvider }
 */
