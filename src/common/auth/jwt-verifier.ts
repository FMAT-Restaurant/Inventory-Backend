import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub?: unknown;
  exp?: unknown;
  iss?: unknown;
  [claim: string]: unknown;
}

export interface JwtVerificationOptions {
  secret: string;
  issuer?: string;
}

export type JwtFailureReason =
  | 'malformed'
  | 'unsupported-alg'
  | 'bad-signature'
  | 'expired'
  | 'wrong-issuer';

export class JwtVerificationError extends Error {
  constructor(
    readonly reason: JwtFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'JwtVerificationError';
  }
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Verifica un access token HS256 firmado con HMAC-SHA256, sin dependencias
 * externas. Valida estructura, algoritmo, firma, vigencia (exp) y emisor
 * (iss) cuando se configura.
 */
export function verifyAccessToken(
  token: string,
  options: JwtVerificationOptions,
): JwtPayload {
  const parts = token.split('.');
  if (
    parts.length !== 3 ||
    parts.some((part) => part.length === 0 || !BASE64URL_PATTERN.test(part))
  ) {
    throw new JwtVerificationError('malformed', 'Token malformado');
  }

  const [headerPart, payloadPart, signaturePart] = parts;

  let header: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerPart));
  } catch {
    throw new JwtVerificationError('malformed', 'Header del token inválido');
  }

  // Solo se acepta HS256: rechazar cualquier otro algoritmo evita
  // ataques de confusión de algoritmo (incluido "none").
  if (header.alg !== 'HS256') {
    throw new JwtVerificationError(
      'unsupported-alg',
      'El algoritmo del token no es HS256',
    );
  }

  const expectedSignature = createHmac('sha256', options.secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url');
  if (
    expectedSignature.length !== signaturePart.length ||
    !timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signaturePart),
    )
  ) {
    throw new JwtVerificationError('bad-signature', 'Firma del token inválida');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    throw new JwtVerificationError('malformed', 'Payload del token inválido');
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new JwtVerificationError('malformed', 'Payload del token inválido');
  }
  const claims = payload as JwtPayload;

  if (claims.exp !== undefined && typeof claims.exp !== 'number') {
    throw new JwtVerificationError(
      'malformed',
      'Fecha de expiración inválida',
    );
  }
  // exp es un NumericDate: el token no debe aceptarse en o después de exp.
  if (claims.exp !== undefined && Math.floor(Date.now() / 1000) >= claims.exp) {
    throw new JwtVerificationError('expired', 'Token vencido');
  }

  if (options.issuer !== undefined && claims.iss !== options.issuer) {
    throw new JwtVerificationError('wrong-issuer', 'Emisor del token inválido');
  }

  return claims;
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}
