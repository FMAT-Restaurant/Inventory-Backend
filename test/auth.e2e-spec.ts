import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

const AUTH_SECRET = 'e2e-auth-secret';
const USER_ID = 'user-e2e-1';

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function signToken(
  payload: Record<string, unknown>,
  secret: string = AUTH_SECRET,
): string {
  const headerPart = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadPart = base64Url(JSON.stringify(payload));
  const signaturePart = createHmac('sha256', secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url');
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

const validToken = signToken({ sub: USER_ID });
const expiredToken = signToken({
  sub: USER_ID,
  exp: Math.floor(Date.now() / 1000) - 60,
});
const otherUserToken = signToken({ sub: 'user-e2e-2' });

function authHeaders(
  token: string,
  extras: Record<string, string> = {},
): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'x-user-id': USER_ID,
    ...extras,
  };
}

describe('AuthGuard (e2e)', () => {
  let app: INestApplication<App>;
  let previousAuthEnabled: string | undefined;
  let previousSecret: string | undefined;

  beforeAll(async () => {
    previousAuthEnabled = process.env.AUTH_ENABLED;
    previousSecret = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_ENABLED = 'true';
    process.env.AUTH_JWT_SECRET = AUTH_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousAuthEnabled === undefined) {
      delete process.env.AUTH_ENABLED;
    } else {
      process.env.AUTH_ENABLED = previousAuthEnabled;
    }
    if (previousSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = previousSecret;
    }
  });

  it('mantiene el healthcheck público sin token', () => {
    return request(app.getHttpServer()).get('/').expect(200);
  });

  it('rechaza con 401 cuando falta el Authorization', () => {
    return request(app.getHttpServer()).get('/items').expect(401);
  });

  it('rechaza con 401 un token con firma inválida', () => {
    const badSignatureToken = signToken({ sub: USER_ID }, 'secreto-equivocado');

    return request(app.getHttpServer())
      .get('/items')
      .set(authHeaders(badSignatureToken))
      .expect(401);
  });

  it('rechaza con 401 un token vencido', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set(authHeaders(expiredToken))
      .expect(401);
  });

  it('rechaza con 401 cuando sub no coincide con X-User-Id', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set({
        authorization: `Bearer ${otherUserToken}`,
        'x-user-id': USER_ID,
      })
      .expect(401);
  });

  it('rechaza con 401 cuando falta X-User-Id', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set('authorization', `Bearer ${validToken}`)
      .expect(401);
  });

  it('rechaza con 403 un token válido sin el permiso requerido', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set(
        authHeaders(validToken, {
          'x-user-permissions': 'inventory:suppliers:read',
        }),
      )
      .expect(403);
  });

  it('autoriza con 200 cuando el permiso está presente', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set(
        authHeaders(validToken, {
          'x-staff-id': 'staff-1',
          'x-user-roles': 'staff',
          'x-user-permissions': 'inventory:items:read, inventory:items:write',
        }),
      )
      .expect(200);
  });

  it('autoriza con 200 al administrador con el comodín *', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set(
        authHeaders(validToken, {
          'x-user-roles': 'ADMINISTRADOR',
          'x-user-permissions': '*',
        }),
      )
      .expect(200);
  });

  it('autoriza con 200 al rol ADMINISTRADOR aunque no haya permisos', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set(authHeaders(validToken, { 'x-user-roles': 'ADMINISTRADOR' }))
      .expect(200);
  });

  it('acepta el formato de permisos con puntos por compatibilidad', () => {
    return request(app.getHttpServer())
      .get('/items')
      .set(
        authHeaders(validToken, {
          'x-user-permissions': 'inventory.items.read',
        }),
      )
      .expect(200);
  });

  it('bloquea las mutaciones de recetas con 403 aunque haya autenticación', () => {
    return request(app.getHttpServer())
      .post('/recipes')
      .set(
        authHeaders(validToken, {
          'x-user-permissions': 'inventory:recipes:read',
        }),
      )
      .send({ plateId: 'PLATE-1', name: 'Pizza', items: [] })
      .expect(403);
  });

  it('mantiene bloqueadas las mutaciones de recetas para el administrador', () => {
    return request(app.getHttpServer())
      .post('/recipes')
      .set(
        authHeaders(validToken, {
          'x-user-roles': 'ADMINISTRADOR',
          'x-user-permissions': '*',
        }),
      )
      .send({ plateId: 'PLATE-1', name: 'Pizza', items: [] })
      .expect(403);
  });
});
