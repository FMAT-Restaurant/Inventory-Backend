import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 30000;

function resolveCacheTtl(): number {
  const configured = Number(process.env.RESERVATION_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_CACHE_TTL_MS;
}

/**
 * Caché de lectura en memoria para reservas.
 *
 * MongoDB sigue siendo la fuente de verdad. Esta caché solo acelera consultas
 * repetidas y se invalida ante cualquier mutación de reservas. En despliegues
 * con varias réplicas cada instancia mantiene su propia caché, lo que es
 * correcto porque la consistencia siempre se recupera desde MongoDB.
 */
@Injectable()
export class ReservationCacheService {
  private readonly enabled = process.env.RESERVATION_CACHE_ENABLED !== 'false';
  private readonly ttlMs = resolveCacheTtl();
  private readonly orderEntries = new Map<string, CacheEntry<unknown>>();
  private readonly queryEntries = new Map<string, CacheEntry<unknown>>();

  getOrder<T>(orderId: string): T | undefined {
    return this.get<T>(this.orderEntries, orderId);
  }

  setOrder<T>(orderId: string, value: T, expiresAt?: Date | null): void {
    if (!this.enabled || this.ttlMs === 0) {
      return;
    }

    const ttl = this.resolveOrderTtl(expiresAt);
    if (ttl <= 0) {
      this.orderEntries.delete(orderId);
      return;
    }

    this.orderEntries.set(orderId, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  getQuery<T>(key: string): T | undefined {
    return this.get<T>(this.queryEntries, key);
  }

  setQuery<T>(key: string, value: T): void {
    if (!this.enabled || this.ttlMs === 0) {
      return;
    }

    this.queryEntries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidateOrder(orderId: string): void {
    this.orderEntries.delete(orderId);
    this.queryEntries.clear();
  }

  invalidateAll(): void {
    this.orderEntries.clear();
    this.queryEntries.clear();
  }

  private resolveOrderTtl(expiresAt?: Date | null): number {
    if (!expiresAt) {
      return this.ttlMs;
    }

    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining)) {
      return this.ttlMs;
    }
    return Math.min(this.ttlMs, remaining);
  }

  private get<T>(
    entries: Map<string, CacheEntry<unknown>>,
    key: string,
  ): T | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const entry = entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }
}
