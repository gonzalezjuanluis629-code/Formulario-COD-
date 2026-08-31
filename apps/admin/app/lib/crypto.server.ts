import * as crypto from 'node:crypto';

/** Misma derivación que la API y el worker. Clave por tienda desde la master key. */
function shopKey(shopId: string): Buffer {
  const master = Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, 'base64');
  return Buffer.from(
    crypto.hkdfSync('sha256', master, Buffer.from(shopId), Buffer.from('cod-shop-key'), 32),
  );
}

export function encryptForShop(shopId: string, plain: string): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', shopKey(shopId), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decryptForShop(shopId: string, blob: Buffer): string {
  const d = crypto.createDecipheriv('aes-256-gcm', shopKey(shopId), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
}
