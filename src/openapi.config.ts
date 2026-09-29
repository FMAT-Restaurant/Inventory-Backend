import { DocumentBuilder } from '@nestjs/swagger';

export function createOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('Inventory Backend')
    .setDescription('API del inventario')
    .setVersion(process.env.APP_VERSION ?? '0.0.1')
    .build();
}
