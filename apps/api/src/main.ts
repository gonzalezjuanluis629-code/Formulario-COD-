import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  // El body crudo es imprescindible: sin él no se puede verificar el HMAC de los webhooks.
  app.use(json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0');
}
void bootstrap();
