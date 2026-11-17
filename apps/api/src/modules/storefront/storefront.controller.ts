import { Controller, Get, Header, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ShopSettingsSchema } from '@cod/contracts';
import { ShopContextService } from '../../infra/shopify/shop-context.service';
import { isValidStorefrontKey } from '../../shared/storefront/storefront-key';

/**
 * Cargador del formulario para tiendas conectadas desde Figui (sin extensión
 * del tema). Shopify lo inyecta en la tienda (ScriptTag) o el comerciante lo
 * pega en un bloque «Liquid personalizado». Pone el botón donde toca y carga
 * el widget desde este servidor.
 */
@Controller('storefront')
export class StorefrontController {
  constructor(private shops: ShopContextService) {}

  @Get('loader.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=120')
  @Header('Access-Control-Allow-Origin', '*')
  async loader(@Req() req: Request, @Query('shop') shop: string, @Query('k') k: string) {
    if (!shop || !k || !isValidStorefrontKey(shop, k)) throw new UnauthorizedException('Clave de la tienda inválida');
    const ctx = await this.shops.byDomain(shop);
    const sf = ShopSettingsSchema.parse(ctx.settings ?? {}).storefront;
    // Dirección fija del servidor (variable PUBLIC_API_URL): no se arma con
    // cabeceras que el visitante podría falsear (el script se guarda en caché).
    const base = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.headers.host}`).replace(/\/+$/, '');
    const cfg = { api: `${base}/apps/cod`, widget: `${base}/storefront/widget/widget.js`, shop: ctx.domain, k, autoPlace: sf.autoPlace, floating: sf.floating, cartButton: sf.cartButton };
    return LOADER.replace('__CFG__', JSON.stringify(cfg));
  }
}

const LOADER = `/* Formulario COD */
(function () {
  if (window.__CODF__) return;
  var C = window.__CODF__ = __CFG__;
  function load() {
    if (document.querySelector('script[data-codf]')) return;
    var s = document.createElement('script');
    s.type = 'module'; s.src = C.widget; s.setAttribute('data-codf', '1');
    document.head.appendChild(s);
  }
  function div(attrs) {
    var d = document.createElement('div');
    for (var key in attrs) d.setAttribute(key, attrs[key]);
    document.body.appendChild(d);
  }
  function place(ids) {
    // Si el tema ya trae los botones de la app (extensión), no se duplican.
    // El botón flotante lo pone el widget, y solo donde haya un botón fijo.
    if (C.autoPlace && !document.querySelector('[data-cod-autoplace],[data-cod-auto]')) {
      div(Object.assign({ hidden: '', 'data-cod-autoplace': '' }, ids));
    }
    load();
  }
  // Botón del carrito: el widget se carga cuando aparece un «Pagar» del tema
  // (página del carrito o carrito lateral al añadir un producto).
  var CHECKOUT = 'button[name="checkout"],input[name="checkout"],button#checkout,a[href$="/checkout"]';
  function watchCart() {
    if (!C.cartButton) return;
    if (document.querySelector(CHECKOUT)) { load(); return; }
    var mo = new MutationObserver(function () {
      if (document.querySelector(CHECKOUT)) { mo.disconnect(); load(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  function go() {
    watchCart();
    // El tema (snippet de Figui) ya dice el producto de la página.
    var pd = document.querySelector('[data-cod-product]');
    if (pd) {
      place({ 'data-product-id': pd.getAttribute('data-product-id'), 'data-variant-id': pd.getAttribute('data-variant-id') });
      return;
    }
    var m = location.pathname.match(/\\/products\\/([^\\/?#]+)/);
    if (!m) { if (document.querySelector('[data-cod-form]')) load(); return; }
    var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
    fetch(root + 'products/' + m[1] + '.js', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (p) {
        var wanted = new URLSearchParams(location.search).get('variant');
        var v = (wanted && p.variants.filter(function (x) { return String(x.id) === wanted; })[0])
          || p.variants.filter(function (x) { return x.available; })[0] || p.variants[0];
        place({ 'data-product-id': 'gid://shopify/Product/' + p.id, 'data-variant-id': 'gid://shopify/ProductVariant/' + v.id });
      })
      .catch(function () { if (document.querySelector('[data-cod-form]')) load(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
`;
