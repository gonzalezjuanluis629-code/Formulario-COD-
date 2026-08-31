import { Injectable, Logger } from '@nestjs/common';
import { getCountryProfile, type NormalizedAddress } from '@cod/geo';
import { AdminClientService } from './admin-client.service';
import type { ShopContext } from './shop-context.service';

export interface CreateOrderInput {
  variantId: string; // gid://shopify/ProductVariant/…
  qty: number;
  currency: string;
  totals: {
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    totalCents: number;
  };
  customer: {
    firstName: string;
    lastName: string;
    phoneE164: string;
    email: string | null;
  };
  address: NormalizedAddress;
  location: {
    lat: number;
    lng: number;
    accuracyMeters: number | null;
    source: string;
    capturedAt: string;
  } | null;
  note: string | null;
  tags: string[];
  gateway: string;
  discountLabel: string | null;
}

/**
 * Creación del pedido con la Admin GraphQL API (`orderCreate`).
 *
 * Decisiones importantes:
 * - `financialStatus: PENDING` — es contra entrega, aún no se ha cobrado.
 * - `inventoryBehaviour: DECREMENT_IGNORING_POLICY` — el stock baja igual que
 *   en un pedido normal. Sin esto, se vende inventario fantasma.
 * - `sendReceipt: false` — no queremos que Shopify mande el correo de compra
 *   antes de que el pedido esté confirmado por WhatsApp.
 * - Las coordenadas se guardan como `customAttributes`. Las que empiezan por
 *   guion bajo son internas; la última (sin guion) la ve el repartidor.
 */
@Injectable()
export class OrderService {
  private readonly log = new Logger(OrderService.name);

  constructor(private admin: AdminClientService) {}

  async create(ctx: ShopContext, input: CreateOrderInput): Promise<{ id: string; name: string }> {
    const profile = getCountryProfile(ctx.countryCode);
    const shopifyAddr = profile.toShopifyAddress(input.address);

    const attrs: { key: string; value: string }[] = [];
    if (input.address.district) attrs.push({ key: 'Sector', value: input.address.district });

    if (input.location) {
      const { lat, lng, accuracyMeters, source, capturedAt } = input.location;
      attrs.push(
        { key: '_cod_lat', value: lat.toFixed(6) },
        { key: '_cod_lng', value: lng.toFixed(6) },
        { key: '_cod_location_source', value: source },
        { key: '_cod_captured_at', value: capturedAt },
      );
      if (accuracyMeters != null) {
        attrs.push({ key: '_cod_accuracy_m', value: String(Math.round(accuracyMeters)) });
      }
      // Sin guion bajo = visible para el equipo y para el courier. Un clic y ahí está la casa.
      attrs.push({ key: 'Ubicación (mapa)', value: `https://maps.google.com/?q=${lat},${lng}` });
    }

    const variables = {
      order: {
        currency: input.currency,
        email: input.customer.email ?? undefined,
        phone: input.customer.phoneE164,
        note: input.note ?? undefined,
        tags: input.tags,
        customAttributes: attrs,
        lineItems: [{ variantId: input.variantId, quantity: input.qty }],
        shippingAddress: {
          firstName: input.customer.firstName,
          lastName: input.customer.lastName,
          phone: input.customer.phoneE164,
          address1: shopifyAddr.address1,
          address2: shopifyAddr.address2 ?? undefined,
          city: shopifyAddr.city,
          provinceCode: shopifyAddr.provinceCode ?? undefined,
          countryCode: shopifyAddr.countryCode,
          zip: shopifyAddr.zip ?? undefined,
        },
        shippingLines: [
          {
            title: 'Envío',
            priceSet: {
              shopMoney: {
                amount: (input.totals.shippingCents / 100).toFixed(2),
                currencyCode: input.currency,
              },
            },
          },
        ],
        ...(input.totals.discountCents > 0
          ? {
              discountCode: {
                itemFixedDiscountCode: {
                  code: input.discountLabel ?? 'COD-DESCUENTO',
                  amountSet: {
                    shopMoney: {
                      amount: (input.totals.discountCents / 100).toFixed(2),
                      currencyCode: input.currency,
                    },
                  },
                },
              },
            }
          : {}),
        transactions: [
          {
            kind: 'SALE',
            status: 'PENDING', // contra entrega: se cobra al recibir
            gateway: input.gateway,
            amountSet: {
              shopMoney: {
                amount: (input.totals.totalCents / 100).toFixed(2),
                currencyCode: input.currency,
              },
            },
          },
        ],
      },
      options: {
        inventoryBehaviour: 'DECREMENT_IGNORING_POLICY',
        sendReceipt: false,
        sendFulfillmentReceipt: false,
      },
    };

    const data = await this.admin.graphql<{
      orderCreate: {
        order: { id: string; name: string } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(ctx, MUTATION, variables);

    const { order, userErrors } = data.orderCreate;

    if (userErrors?.length) {
      // Causa nº1 de fallo: provinceCode inválido. Se registra explícito para el panel.
      const msg = userErrors.map((e) => `${e.field?.join('.') ?? '-'}: ${e.message}`).join(' | ');
      this.log.error(`orderCreate falló en ${ctx.domain}: ${msg}`);
      throw new Error(msg);
    }
    if (!order) throw new Error('orderCreate no devolvió pedido');

    this.log.log(`Pedido ${order.name} creado en ${ctx.domain}`);
    return order;
  }
}

const MUTATION = /* GraphQL */ `
  mutation CodOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;
