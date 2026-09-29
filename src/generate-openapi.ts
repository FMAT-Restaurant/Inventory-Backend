import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { stringify } from 'yaml';
import { createOpenApiConfig } from './openapi.config.js';

// Nest requiere DATABASE_URL para construir PrismaService. Generar el documento
// no inicializa la aplicación ni abre una conexión con PostgreSQL.
process.env.DATABASE_URL ??=
  'postgresql://openapi:openapi@localhost:5432/openapi';

const { AppModule } = await import('./app.module.js');
const app = await NestFactory.create(AppModule, { logger: false });

try {
  const document = SwaggerModule.createDocument(app, createOpenApiConfig());
  await writeFile('openapi.yml', stringify(document));
} finally {
  await app.close();
}
