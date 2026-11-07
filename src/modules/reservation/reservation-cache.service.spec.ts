import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationCacheService } from './reservation-cache.service.js';

describe('ReservationCacheService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.RESERVATION_CACHE_ENABLED = 'true';
    process.env.RESERVATION_CACHE_TTL_MS = '1000';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RESERVATION_CACHE_ENABLED;
    delete process.env.RESERVATION_CACHE_TTL_MS;
  });

  it('devuelve valores cacheados hasta que expira el TTL', () => {
    const cache = new ReservationCacheService();
    cache.setQuery('pending', [{ orderId: 'O-1' }]);

    expect(cache.getQuery('pending')).toEqual([{ orderId: 'O-1' }]);

    vi.advanceTimersByTime(1001);
    expect(cache.getQuery('pending')).toBeUndefined();
  });

  it('no cachea una reserva más allá de su expiración', () => {
    const cache = new ReservationCacheService();
    const expiresAt = new Date(Date.now() + 200);
    cache.setOrder('O-1', { orderId: 'O-1' }, expiresAt);

    vi.advanceTimersByTime(201);
    expect(cache.getOrder('O-1')).toBeUndefined();

    cache.setOrder(
      'O-2',
      { orderId: 'O-2' },
      new Date(Date.now() - 1000),
    );
    expect(cache.getOrder('O-2')).toBeUndefined();
  });

  it('invalida la entrada de orden y todas las consultas al mutar reservas', () => {
    const cache = new ReservationCacheService();
    cache.setOrder('O-1', { orderId: 'O-1' });
    cache.setQuery('pending', [{ orderId: 'O-1' }]);

    cache.invalidateOrder('O-1');

    expect(cache.getOrder('O-1')).toBeUndefined();
    expect(cache.getQuery('pending')).toBeUndefined();
  });

  it('se desactiva totalmente con RESERVATION_CACHE_ENABLED=false', () => {
    process.env.RESERVATION_CACHE_ENABLED = 'false';
    const cache = new ReservationCacheService();

    cache.setOrder('O-1', { orderId: 'O-1' });
    cache.setQuery('pending', [{ orderId: 'O-1' }]);

    expect(cache.getOrder('O-1')).toBeUndefined();
    expect(cache.getQuery('pending')).toBeUndefined();
  });
});
