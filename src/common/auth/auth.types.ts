import type { Request } from 'express';

/**
 * Catálogo de permisos que el gateway propaga en X-User-Permissions.
 * Los strings deben coincidir con los que emite el auth server.
 * Formato canónico: `inventory:<entidad>:<acción>`.
 */
export const PERMISSIONS = {
  ITEMS_READ: 'inventory:items:read',
  ITEMS_WRITE: 'inventory:items:write',
  BATCHES_READ: 'inventory:batches:read',
  BATCHES_WRITE: 'inventory:batches:write',
  SUPPLIERS_READ: 'inventory:suppliers:read',
  SUPPLIERS_WRITE: 'inventory:suppliers:write',
  RECIPES_READ: 'inventory:recipes:read',
  RESERVATIONS_READ: 'inventory:reservations:read',
  MOVEMENTS_READ: 'inventory:movements:read',
} as const;

/** Comodín que el auth server emite para el administrador. */
export const WILDCARD_PERMISSION = '*';

/** Rol con acceso total. Se acepta además del comodín `*`. */
export const ADMIN_ROLE = 'ADMINISTRADOR';

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface AuthUser {
  /** Claim `sub` del token, propagado por el gateway como X-User-Id. */
  userId: string;
  /** Identificador de staff, propagado como X-Staff-Id. Opcional. */
  staffId?: string;
  /**
   * Roles propagados en X-User-Roles. El rol ADMINISTRADOR se acepta como
   * bypass de autorización, además del comodín `*` en `permissions`.
   */
  roles: string[];
  /** Permisos propagados en X-User-Permissions. Base de la autorización. */
  permissions: string[];
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}

export type RequestWithUser = Request & { user?: AuthUser };
