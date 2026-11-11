import { createHmac } from 'node:crypto';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import {
  BLOCKED_REASON_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from './auth.decorators.js';
import { AuthConfigService } from './auth.config.js';
import { AuthGuard } from './auth.guard.js';

const SECRET = 'guard-test-secret';
const ENV_KEYS = ['AUTH_ENABLED', 'AUTH_JWT_SECRET', 'AUTH_JWT_ISSUER'] as const;

type EnvOverrides = Partial<
  Record<(typeof ENV_KEYS)[number], string | undefined>
>;

function buildConfig(env: EnvOverrides = {}): AuthConfigService {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    return new AuthConfigService();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function signToken(
  payload: Record<string, unknown>,
  secret: string = SECRET,
): string {
  const headerPart = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadPart = base64Url(JSON.stringify(payload));
  const signaturePart = createHmac('sha256', secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url');
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

function buildReflector(metadata: {
  isPublic?: boolean;
  blockedReason?: string;
  requiredPermissions?: string[];
}): Reflector {
  return {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) {
        return metadata.isPublic ?? false;
      }
      if (key === BLOCKED_REASON_KEY) {
        return metadata.blockedReason;
      }
      if (key === REQUIRED_PERMISSIONS_KEY) {
        return metadata.requiredPermissions;
      }
      return undefined;
    }),
  } as unknown as Reflector;
}

function buildContext(
  headers: Record<string, string | string[] | undefined>,
): { context: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Route {},
  } as unknown as ExecutionContext;
  return { context, request };
}

const USER_ID = 'user-1';
const validToken = () => signToken({ sub: USER_ID });

function identityHeaders(
  token: string,
  extras: Record<string, string | string[]> = {},
): Record<string, string | string[]> {
  return {
    authorization: `Bearer ${token}`,
    'x-user-id': USER_ID,
    ...extras,
  };
}

describe('AuthGuard', () => {
  it('deja pasar todo cuando la autenticación está deshabilitada', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_ENABLED: 'false' }),
      buildReflector({}),
    );
    const { context, request } = buildContext({});

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('respeta rutas públicas sin exigir headers', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({ isPublic: true }),
    );

    expect(guard.canActivate(buildContext({}).context)).toBe(true);
  });

  it('rechaza con 401 cuando falta el token', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );

    expect(() => guard.canActivate(buildContext({}).context)).toThrowError(
      'Token de acceso ausente',
    );
  });

  it('rechaza con 401 esquemas distintos de Bearer', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );
    const headers = identityHeaders(validToken());
    headers.authorization = 'Basic dXNlcjpwYXNz';

    expect(() => guard.canActivate(buildContext(headers).context)).toThrowError(
      'Token de acceso ausente',
    );
  });

  it('rechaza con 401 tokens con firma inválida', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );
    const token = signToken({ sub: USER_ID }, 'secreto-equivocado');

    expect(() =>
      guard.canActivate(buildContext(identityHeaders(token)).context),
    ).toThrowError('Firma del token inválida');
  });

  it('rechaza con 401 tokens vencidos', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );
    const token = signToken({
      sub: USER_ID,
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    expect(() =>
      guard.canActivate(buildContext(identityHeaders(token)).context),
    ).toThrowError('Token vencido');
  });

  it('rechaza con 401 cuando falta X-User-Id', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );

    expect(() =>
      guard.canActivate(
        buildContext({ authorization: `Bearer ${validToken()}` }).context,
      ),
    ).toThrowError('Identidad de usuario ausente (X-User-Id)');
  });

  it('rechaza con 401 cuando sub no coincide con X-User-Id', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );
    const token = signToken({ sub: 'otro-usuario' });

    expect(() =>
      guard.canActivate(buildContext(identityHeaders(token)).context),
    ).toThrowError(
      'La identidad del token no coincide con la propagada por el gateway',
    );
  });

  it('autentica y adjunta el usuario con roles y permisos separados por comas', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );
    const { context, request } = buildContext(
      identityHeaders(validToken(), {
        'x-staff-id': ' staff-9 ',
        'x-user-roles': ' staff , chef ,',
        'x-user-permissions': 'inventory:items:read, inventory:items:write',
      }),
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({
      userId: USER_ID,
      staffId: 'staff-9',
      roles: ['staff', 'chef'],
      permissions: ['inventory:items:read', 'inventory:items:write'],
    });
  });

  it('autentica sin staffId ni roles ni permisos', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );
    const { context, request } = buildContext(identityHeaders(validToken()));

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({
      userId: USER_ID,
      roles: [],
      permissions: [],
    });
  });

  it('acepta headers repetidos concatenando sus valores', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );
    const { context, request } = buildContext(
      identityHeaders(validToken(), {
        'x-user-roles': ['staff', 'chef'],
      }),
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toMatchObject({ roles: ['staff', 'chef'] });
  });

  it('bloquea con 403 rutas marcadas aunque el usuario esté autenticado', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({
        blockedReason: 'Las recetas se gestionan mediante eventos de Menú',
      }),
    );

    expect(() =>
      guard.canActivate(buildContext(identityHeaders(validToken())).context),
    ).toThrowError('Las recetas se gestionan mediante eventos de Menú');
  });

  it('autoriza cuando el usuario tiene alguno de los permisos requeridos', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({
        requiredPermissions: [
          'inventory:items:read',
          'inventory:items:write',
        ],
      }),
    );
    const headers = identityHeaders(validToken(), {
      'x-user-permissions': 'inventory:items:write',
    });

    expect(guard.canActivate(buildContext(headers).context)).toBe(true);
  });

  it('rechaza con 403 cuando falta el permiso requerido', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({
        requiredPermissions: ['inventory:items:read'],
      }),
    );
    const headers = identityHeaders(validToken(), {
      'x-user-permissions': 'inventory:suppliers:read',
    });

    expect(() => guard.canActivate(buildContext(headers).context)).toThrowError(
      'Permisos insuficientes para esta operación',
    );
  });

  it('autoriza con el comodín * aunque no coincida el permiso requerido', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({ requiredPermissions: ['inventory:items:read'] }),
    );
    const headers = identityHeaders(validToken(), {
      'x-user-permissions': '*',
    });

    expect(guard.canActivate(buildContext(headers).context)).toBe(true);
  });

  it('autoriza al rol ADMINISTRADOR sin permisos en el header', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({ requiredPermissions: ['inventory:items:write'] }),
    );
    const headers = identityHeaders(validToken(), {
      'x-user-roles': 'ADMINISTRADOR',
    });

    expect(guard.canActivate(buildContext(headers).context)).toBe(true);
  });

  it('acepta permisos con separador de puntos por compatibilidad', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({ requiredPermissions: ['inventory:items:read'] }),
    );
    const headers = identityHeaders(validToken(), {
      'x-user-permissions': 'inventory.items.read',
    });

    expect(guard.canActivate(buildContext(headers).context)).toBe(true);
  });

  it('no autoriza a un rol distinto de ADMINISTRADOR sin el permiso', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({ requiredPermissions: ['inventory:items:write'] }),
    );
    const headers = identityHeaders(validToken(), {
      'x-user-roles': 'MESERO',
      'x-user-permissions': 'inventory:items:read',
    });

    expect(() => guard.canActivate(buildContext(headers).context)).toThrowError(
      'Permisos insuficientes para esta operación',
    );
  });

  it('mantiene bloqueadas las rutas marcadas incluso para ADMINISTRADOR', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({
        blockedReason: 'Las recetas se gestionan mediante eventos de Menú',
      }),
    );
    const headers = identityHeaders(validToken(), {
      'x-user-roles': 'ADMINISTRADOR',
      'x-user-permissions': '*',
    });

    expect(() => guard.canActivate(buildContext(headers).context)).toThrowError(
      'Las recetas se gestionan mediante eventos de Menú',
    );
  });

  it('no exige permisos cuando la ruta no declara ninguno', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET }),
      buildReflector({}),
    );

    expect(
      guard.canActivate(buildContext(identityHeaders(validToken())).context),
    ).toBe(true);
  });

  it('valida el emisor configurado', () => {
    const guard = new AuthGuard(
      buildConfig({ AUTH_JWT_SECRET: SECRET, AUTH_JWT_ISSUER: 'auth-server' }),
      buildReflector({}),
    );
    const token = signToken({ sub: USER_ID, iss: 'otro-emisor' });

    expect(() =>
      guard.canActivate(buildContext(identityHeaders(token)).context),
    ).toThrowError('Emisor del token inválido');
  });
});

describe('AuthConfigService', () => {
  it('habilita la autenticación por defecto', () => {
    expect(buildConfig({ AUTH_JWT_SECRET: SECRET }).enabled).toBe(true);
  });

  it('solo deshabilita con AUTH_ENABLED=false', () => {
    expect(buildConfig({ AUTH_ENABLED: 'false' }).enabled).toBe(false);
    expect(
      buildConfig({ AUTH_ENABLED: 'true', AUTH_JWT_SECRET: SECRET }).enabled,
    ).toBe(true);
  });

  it('falla al instanciarse si está habilitada sin secreto', () => {
    expect(() => buildConfig({})).toThrowError('AUTH_JWT_SECRET');
  });

  it('recorta el issuer y lo omite si está vacío', () => {
    expect(buildConfig({ AUTH_JWT_SECRET: SECRET, AUTH_JWT_ISSUER: ' ' }).issuer).toBeUndefined();
    expect(
      buildConfig({ AUTH_JWT_SECRET: SECRET, AUTH_JWT_ISSUER: ' auth ' })
        .issuer,
    ).toBe('auth');
  });
});
