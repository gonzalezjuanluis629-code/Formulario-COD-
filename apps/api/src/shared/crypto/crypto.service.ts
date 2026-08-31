import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

/**
 * Cifrado de PII y de credenciales.
 *
 * - AES-256-GCM con clave DERIVADA POR TIENDA (HKDF desde la master key).
 *   Si se filtra la clave de una tienda, las demás siguen a salvo.
 * - Los teléfonos/emails también se hashean (HMAC + pepper) para poder
 *   deduplicar y aplicar blocklists SIN descifrar nada.
 */
@Injectable()
export class CryptoService {
  private readonly master = Buffer.from(process.env.MASTER_ENCRYPTION_KEY ?? '', 'base64');
  private readonly pepper = process.env.PII_HASH_PEPPER ?? '';

  constructor() {
    if (this.master.length !== 32) {
      throw new Error('MASTER_ENCRYPTION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)');
    }
    if (!this.pepper) throw new Error('Falta PII_HASH_PEPPER');
  }

  private shopKey(shopId: string): Buffer {
    return Buffer.from(
      crypto.hkdfSync('sha256', this.master, Buffer.from(shopId), Buffer.from('cod-shop-key'), 32),
    );
  }

  encrypt(shopId: string, plain: string): Buffer {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.shopKey(shopId), iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    // [iv(12) | tag(16) | ciphertext]
    return Buffer.concat([iv, c.getAuthTag(), ct]);
  }

  decrypt(shopId: string, blob: Buffer): string {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', this.shopKey(shopId), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  }

  /** Hash estable para dedup/blocklist. No reversible. */
  hash(value: string): string {
    return crypto.createHmac('sha256', this.pepper)
      .update(value.trim().toLowerCase()).digest('hex');
  }

  /** Comparación en tiempo constante — obligatoria al verificar HMAC. */
  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  }
}
