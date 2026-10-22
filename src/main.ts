import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import 'dotenv/config';
import { AppModule } from './app.module.js';
import { createOpenApiConfig } from './openapi.config.js';

async function bootstrap() {
  // Red de seguridad: sin estos listeners, un 'error' emitido por un
  // EventEmitter sin manejar (p. ej. amqplib al caerse el broker) termina el
  // proceso Node y deja el servicio sin responder.
  process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
  });

  const app = await NestFactory.create(AppModule);
  const frontendOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: frontendOrigins.length > 0 ? frontendOrigins : true,
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  SwaggerModule.setup('api', app, () =>
    SwaggerModule.createDocument(app, createOpenApiConfig()),
  );
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
