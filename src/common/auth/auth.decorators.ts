import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './auth.types.js';

export const IS_PUBLIC_KEY = 'auth:is-public';

/** Marca una ruta como pública: no exige token ni identidad. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REQUIRED_PERMISSIONS_KEY = 'auth:required-permissions';

/**
 * Permisos requeridos por la ruta (semántica any-of): basta con que el
 * usuario tenga uno de los listados en X-User-Permissions.
 */
export const RequiredPermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const BLOCKED_REASON_KEY = 'auth:blocked-reason';

/**
 * Bloquea la ruta para cualquier usuario autenticado con 403 y la razón
 * indicada. Se usa para operaciones que deben llegar solo por eventos.
 */
export const Blocked = (reason: string) =>
  SetMetadata(BLOCKED_REASON_KEY, reason);

/** Accede al usuario autenticado propagado por el gateway. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest().user,
);
