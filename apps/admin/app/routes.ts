import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("auth/*", "routes/auth.$.tsx"),
  route("preview", "routes/preview.tsx"),
  // Integración con Figui: servidor→servidor y selector de productos del editor.
  route("figui-api/connect", "routes/figui-api.connect.ts"),
  route("figui-api/storefront", "routes/figui-api.storefront.ts"),
  route("figui-api/resources", "routes/figui-api.resources.ts"),
  // El mismo editor, abierto desde Figui (sin Shopify App Bridge).
  route("figui", "routes/figui.tsx", [
    index("routes/app.forms._index.tsx", { id: "figui-forms-index" }),
    route("forms/:id", "routes/app.forms.$id.tsx", { id: "figui-form" }),
    route("design", "routes/app.design.tsx", { id: "figui-design" }),
    route("offers", "routes/app.offers.tsx", { id: "figui-offers" }),
    route("shipping", "routes/app.shipping.tsx", { id: "figui-shipping" }),
    route("orders", "routes/app.orders.tsx", { id: "figui-orders" }),
    route("orders/export", "routes/app.orders.export.tsx", { id: "figui-orders-export" }),
    route("analytics", "routes/app.analytics.tsx", { id: "figui-analytics" }),
    route("antifraud", "routes/app.antifraud.tsx", { id: "figui-antifraud" }),
    route("settings", "routes/app.settings.tsx", { id: "figui-settings" }),
  ]),
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("analytics", "routes/app.analytics.tsx"),
    route("antifraud", "routes/app.antifraud.tsx"),
    route("design", "routes/app.design.tsx"),
    route("forms", "routes/app.forms._index.tsx"),
    route("forms/:id", "routes/app.forms.$id.tsx"),
    route("offers", "routes/app.offers.tsx"),
    route("orders", "routes/app.orders.tsx"),
    route("orders/export", "routes/app.orders.export.tsx"),
    route("settings", "routes/app.settings.tsx"),
    route("shipping", "routes/app.shipping.tsx"),
  ]),
] satisfies RouteConfig;
