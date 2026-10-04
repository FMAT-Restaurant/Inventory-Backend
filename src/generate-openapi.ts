import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { stringify } from 'yaml';
import { createOpenApiConfig } from './openapi.config.js';

// Generar el documento OpenAPI no requiere una conexión activa con MongoDB.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/inventory';

const { AppModule } = await import('./app.module.js');
const app = await NestFactory.create(AppModule, { logger: false });

try {
  const document = SwaggerModule.createDocument(app, createOpenApiConfig());
  await writeFile('openapi.yml', stringify(document));
} finally {
  await app.close();
}
