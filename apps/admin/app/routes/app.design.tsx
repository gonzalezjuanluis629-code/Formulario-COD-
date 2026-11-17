import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { requireShop } from '../lib/shop.server';
import { db } from '../db.server';

/**
 * El diseño se edita dentro del editor del formulario, al lado de la vista
 * previa. Esta entrada del menú lleva directo a esa pestaña.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const form =
    (await db.form.findFirst({ where: { shopId: shop.id, status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' } })) ??
    (await db.form.findFirst({ where: { shopId: shop.id, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' } }));

  // Se conservan los parámetros de Shopify (shop, host, id_token…) para no perder la sesión.
  const params = new URL(request.url).searchParams;
  if (!form) return redirect(`/app/forms?${params}`);
  params.set('tab', 'design');
  return redirect(`/app/forms/${form.id}?${params}`);
}

export default function Design() {
  return null;
}
