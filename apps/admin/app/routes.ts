import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("auth/*", "routes/auth.$.tsx"),
  route("preview", "routes/preview.tsx"),
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
