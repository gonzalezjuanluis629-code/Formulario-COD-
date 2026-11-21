import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { json, text, static as expressStatic } from 'express';
import { AppModule } from './app.module';
import { WIDGET_DIST } from './shared/storefront/widget-files';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  // Tiendas conectadas desde Figui: el widget llama directo a la API desde el
  // dominio de la tienda (sin App Proxy). Solo estas rutas públicas abren CORS.
  app.use(['/apps/cod', '/storefront'], (req: any, res: any, next: () => void) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    next();
  });
  // El widget (y sus partes) servido desde aquí para esas tiendas.
  app.use('/storefront/widget', expressStatic(WIDGET_DIST, {
    setHeaders: (res, file) => res.setHeader('Cache-Control', /widget\.js$/.test(file) ? 'public, max-age=300' : 'public, max-age=31536000, immutable'),
  }));

  // El body crudo es imprescindible: sin él no se puede verificar el HMAC de los webhooks.
  app.use(json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  // sendBeacon entre dominios solo puede mandar text/plain: se lee como JSON.
  app.use(text({ type: 'text/plain' }), (req: any, _res: unknown, next: () => void) => {
    if (typeof req.body === 'string') { try { req.body = JSON.parse(req.body); } catch { req.body = {}; } }
    next();
  });

  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0');
}
void bootstrap();
