import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  JwtVerificationError,
  verifyAccessToken,
  type JwtFailureReason,
} from './jwt-verifier.js';

const SECRET = 'unit-test-secret';

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function signToken(
  payload: Record<string, unknown>,
  options?: { secret?: string; alg?: string },
): string {
  const headerPart = base64Url(
    JSON.stringify({ alg: options?.alg ?? 'HS256', typ: 'JWT' }),
  );
  const payloadPart = base64Url(JSON.stringify(payload));
  const signaturePart = createHmac('sha256', options?.secret ?? SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url');
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

function failureReason(token: string, options?: { secret?: string; issuer?: string }): JwtFailureReason {
  try {
    verifyAccessToken(token, {
      secret: options?.secret ?? SECRET,
      issuer: options?.issuer,
    });
  } catch (error) {
    if (error instanceof JwtVerificationError) {
      return error.reason;
    }
    throw error;
  }
  throw new Error('Se esperaba un error de verificación del token');
}

describe('verifyAccessToken', () => {
  it('verifica un token HS256 válido y devuelve sus claims', () => {
    const token = signToken({ sub: 'user-1', iss: 'auth-server' });

    expect(
      verifyAccessToken(token, { secret: SECRET, issuer: 'auth-server' }),
    ).toEqual({ sub: 'user-1', iss: 'auth-server' });
  });

  it('acepta tokens sin exp ni iss', () => {
    const token = signToken({ sub: 'user-1' });

    expect(verifyAccessToken(token, { secret: SECRET })).toEqual({
      sub: 'user-1',
    });
  });

  it('rechaza tokens malformados', () => {
    expect(failureReason('')).toBe('malformed');
    expect(failureReason('token-sin-puntos')).toBe('malformed');
    expect(failureReason('a.b')).toBe('malformed');
    expect(failureReason('a.b.c.d')).toBe('malformed');
    expect(failureReason('..')).toBe('malformed');
    expect(failureReason('con espacios.payload.firma')).toBe('malformed');
  });

  it('rechaza headers y payloads que no son JSON válido', () => {
    const headerPart = Buffer.from('no-json', 'utf8').toString('base64url');
    const payloadPart = base64Url(JSON.stringify({ sub: 'user-1' }));
    const signaturePart = createHmac('sha256', SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest('base64url');

    expect(
      failureReason(`${headerPart}.${payloadPart}.${signaturePart}`),
    ).toBe('malformed');
  });

  it('rechaza payloads que no son un objeto', () => {
    const headerPart = base64Url(JSON.stringify({ alg: 'HS256' }));
    const payloadPart = Buffer.from('"texto"', 'utf8').toString('base64url');
    const signaturePart = createHmac('sha256', SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest('base64url');

    expect(
      failureReason(`${headerPart}.${payloadPart}.${signaturePart}`),
    ).toBe('malformed');
  });

  it('rechaza algoritmos distintos de HS256', () => {
    expect(failureReason(signToken({ sub: 'user-1' }, { alg: 'none' }))).toBe(
      'unsupported-alg',
    );
    expect(failureReason(signToken({ sub: 'user-1' }, { alg: 'RS256' }))).toBe(
      'unsupported-alg',
    );
    expect(failureReason(signToken({ sub: 'user-1' }, { alg: 'HS512' }))).toBe(
      'unsupported-alg',
    );
  });

  it('rechaza firmas inválidas', () => {
    expect(
      failureReason(signToken({ sub: 'user-1' }, { secret: 'otro-secreto' })),
    ).toBe('bad-signature');
  });

  it('detecta alteraciones del payload', () => {
    const token = signToken({ sub: 'user-1', role: 'staff' });
    const [headerPart, , signaturePart] = token.split('.');
    const payloadAlterado = base64Url(
      JSON.stringify({ sub: 'user-1', role: 'admin' }),
    );

    expect(
      failureReason(`${headerPart}.${payloadAlterado}.${signaturePart}`),
    ).toBe('bad-signature');
  });

  it('rechaza tokens vencidos', () => {
    const expirado = signToken({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const justoAhora = signToken({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000),
    });

    expect(failureReason(expirado)).toBe('expired');
    expect(failureReason(justoAhora)).toBe('expired');
  });

  it('acepta tokens vigentes', () => {
    const token = signToken({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    expect(verifyAccessToken(token, { secret: SECRET })).toMatchObject({
      sub: 'user-1',
    });
  });

  it('rechaza exp con tipo incorrecto', () => {
    expect(
      failureReason(signToken({ sub: 'user-1', exp: 'mañana' })),
    ).toBe('malformed');
  });

  it('valida el emisor cuando se configura', () => {
    const token = signToken({ sub: 'user-1', iss: 'otro-emisor' });

    expect(failureReason(token, { issuer: 'auth-server' })).toBe(
      'wrong-issuer',
    );
    expect(
      verifyAccessToken(signToken({ sub: 'user-1', iss: 'auth-server' }), {
        secret: SECRET,
        issuer: 'auth-server',
      }),
    ).toMatchObject({ iss: 'auth-server' });
  });

  it('ignora el emisor cuando no se configura', () => {
    expect(
      verifyAccessToken(signToken({ sub: 'user-1', iss: 'cualquiera' }), {
        secret: SECRET,
      }),
    ).toMatchObject({ iss: 'cualquiera' });
  });
});
