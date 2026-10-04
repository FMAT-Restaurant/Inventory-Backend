import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { createOpenApiConfig } from './openapi.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
