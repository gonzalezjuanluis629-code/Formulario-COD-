import type { LoaderFunctionArgs } from 'react-router';
import { requireShop } from '../lib/shop.server';
import { decryptForShop } from '../lib/crypto.server';
import { db } from '../db.server';

/**
 * Export de pedidos a CSV.
 *
 * Se eligió CSV en vez de la integración con Google Sheets API porque:
 *   - No requiere OAuth de Google ni credenciales que gestionar.
 *   - Se abre en Sheets, Excel o cualquier cosa: el merchant decide.
 *   - La PII se descifra al vuelo, solo para el archivo que él descarga.
 * (La sincronización automática con Sheets se puede añadir después como conector.)
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);

  const rows = await db.submission.findMany({
    where: { shopId: shop.id, status: { in: ['CONFIRMED', 'PENDING', 'HELD'] } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const header = [
    'Fecha', 'Pedido', 'Estado', 'Nombre', 'Teléfono', 'Correo',
    'Provincia', 'Dirección', 'Total', 'Latitud', 'Longitud', 'Mapa', 'Riesgo',
  ];

  const csv = [header.join(',')];
  for (const s of rows) {
    let pii: Record<string, unknown> = {};
    try {
      if (s.customerDataEnc) pii = JSON.parse(decryptForShop(shop.id, Buffer.from(s.customerDataEnc)));
    } catch { /* purgado por GDPR */ }

    const addr = (pii.address ?? {}) as Record<string, unknown>;
    const totals = s.totals as { totalCents?: number };
    const mapUrl = s.latitude != null ? `https://maps.google.com/?q=${s.latitude},${s.longitude}` : '';

    csv.push([
      s.createdAt.toISOString(),
      s.shopifyOrderName ?? '',
      s.status,
      `${pii.firstName ?? ''} ${pii.lastName ?? ''}`.trim(),
      String(pii.phoneE164 ?? ''),
      String(pii.email ?? ''),
      String(addr.province ?? addr.provinceCode ?? ''),
      String(addr.formatted ?? addr.street ?? ''),
      totals?.totalCents ? (totals.totalCents / 100).toFixed(2) : '',
      s.latitude?.toString() ?? '',
      s.longitude?.toString() ?? '',
      mapUrl,
      String(s.riskScore),
    ].map(csvCell).join(','));
  }

  return new Response(csv.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidos-cod-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

/** Escapa comas, comillas y saltos de línea según el estándar CSV. */
function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
