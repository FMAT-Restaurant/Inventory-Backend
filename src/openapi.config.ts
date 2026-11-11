import { DocumentBuilder } from '@nestjs/swagger';

export function createOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('Inventory Backend')
    .setDescription(
      'API del inventario. El acceso se realiza a través del API Gateway (Kong): ' +
        'el cliente presenta un access token Bearer HS256 y el gateway propaga ' +
        'la identidad en los headers X-User-Id, X-Staff-Id, X-User-Roles y ' +
        'X-User-Permissions.',
    )
    .setVersion(process.env.APP_VERSION ?? '0.0.1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addSecurityRequirements('bearer')
    .build();
}
