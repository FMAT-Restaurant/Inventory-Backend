import { Injectable } from '@nestjs/common';

/**
 * Configuración de autenticación. El secure default es habilitada:
 * solo AUTH_ENABLED=false la desactiva (desarrollo local y pruebas sin
 * gateway). Cuando está habilitada exige AUTH_JWT_SECRET y falla al arranque
 * si falta, para no servir tráfico sin poder validar el token.
 */
@Injectable()
export class AuthConfigService {
  readonly enabled: boolean;
  readonly secret: string;
  readonly issuer?: string;

  constructor() {
    this.enabled = process.env.AUTH_ENABLED !== 'false';
    this.secret = process.env.AUTH_JWT_SECRET ?? '';
    const issuer = process.env.AUTH_JWT_ISSUER?.trim();
    this.issuer = issuer ? issuer : undefined;

    if (this.enabled && !this.secret) {
      throw new Error(
        'AUTH_JWT_SECRET es obligatorio cuando la autenticación está habilitada (AUTH_ENABLED=false para deshabilitarla).',
      );
    }
  }
}
