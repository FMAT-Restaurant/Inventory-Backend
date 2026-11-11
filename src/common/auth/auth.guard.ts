import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  BLOCKED_REASON_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from './auth.decorators.js';
import { AuthConfigService } from './auth.config.js';
import {
  ADMIN_ROLE,
  WILDCARD_PERMISSION,
  type AuthUser,
} from './auth.types.js';
import {
  JwtVerificationError,
  verifyAccessToken,
  type JwtPayload,
} from './jwt-verifier.js';

/**
 * Guard global de autenticación y autorización.
 *
 * El API Gateway (Kong) valida el access token HS256 del cliente y propaga
 * la identidad en X-User-Id, X-Staff-Id, X-User-Roles y X-User-Permissions.
 * El servicio verifica además la firma y vigencia del token con el secreto
 * compartido y exige que el claim `sub` coincida con el X-User-Id recibido,
 * de modo que la identidad y los permisos propagados no puedan suplantarse.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly config: AuthConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    request.user = this.authenticate(request);

    const blockedReason = this.reflector.getAllAndOverride<
      string | undefined
    >(BLOCKED_REASON_KEY, targets);
    if (blockedReason !== undefined) {
      throw new ForbiddenException(blockedReason);
    }

    const requiredPermissions = this.reflector.getAllAndOverride<
      string[] | undefined
    >(REQUIRED_PERMISSIONS_KEY, targets);
    if (requiredPermissions === undefined || requiredPermissions.length === 0) {
      return true;
    }

    const user = request.user;
    const authorized = requiredPermissions.some((permission) =>
      isAuthorized(user, permission),
    );
    if (!authorized) {
      throw new ForbiddenException(
        'Permisos insuficientes para esta operación',
      );
    }
    return true;
  }

  private authenticate(request: Request): AuthUser {
    const authorization = request.headers.authorization;
    if (
      authorization === undefined ||
      !authorization.toLowerCase().startsWith('bearer ')
    ) {
      throw new UnauthorizedException('Token de acceso ausente');
    }

    let payload: JwtPayload;
    try {
      payload = verifyAccessToken(
        authorization.slice('bearer '.length).trim(),
        { secret: this.config.secret, issuer: this.config.issuer },
      );
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof JwtVerificationError
          ? error.message
          : 'Token de acceso inválido',
      );
    }

    const userId = firstHeaderValue(request.headers['x-user-id']);
    const staffId = firstHeaderValue(request.headers['x-staff-id']);
    if (userId === undefined) {
      throw new UnauthorizedException(
        'Identidad de usuario ausente (X-User-Id)',
      );
    }
    if (payload.sub !== userId) {
      throw new UnauthorizedException(
        'La identidad del token no coincide con la propagada por el gateway',
      );
    }

    return {
      userId,
      ...(staffId === undefined ? {} : { staffId }),
      roles: splitHeaderValues(request.headers['x-user-roles']),
      permissions: splitHeaderValues(request.headers['x-user-permissions']),
    };
  }
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function splitHeaderValues(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isAuthorized(
  user: AuthUser | undefined,
  requiredPermission: string,
): boolean {
  if (user === undefined) {
    return false;
  }

  if (user.roles.some((role) => role.trim().toUpperCase() === ADMIN_ROLE)) {
    return true;
  }

  const required = normalizePermission(requiredPermission);
  return user.permissions.some((granted) => {
    const normalized = normalizePermission(granted);
    return (
      normalized === WILDCARD_PERMISSION || normalized === required
    );
  });
}

/**
 * Normaliza un permiso para compararlo sin depender del separador usado por
 * el emisor: `inventory:items:read` y `inventory.items.read` son equivalentes.
 */
function normalizePermission(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, ':');
}
