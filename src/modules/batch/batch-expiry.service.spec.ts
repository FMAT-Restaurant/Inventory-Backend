import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchExpiryService } from './batch-expiry.service.js';

function createHarness(syncExpiredStatuses = vi.fn().mockResolvedValue(0)) {
  const service = new BatchExpiryService({ syncExpiredStatuses } as never);
  return { service, syncExpiredStatuses };
}

describe('BatchExpiryService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BATCH_EXPIRY_SWEEP_INTERVAL_MS;
  });

  it('actualiza los lotes vencidos y devuelve el conteo', async () => {
    const { service, syncExpiredStatuses } = createHarness(
      vi.fn().mockResolvedValue(2),
    );

    await expect(service.sweep()).resolves.toBe(2);
    expect(syncExpiredStatuses).toHaveBeenCalledOnce();
  });

  it('devuelve 0 y no propaga errores', async () => {
    const { service } = createHarness(
      vi.fn().mockRejectedValue(new Error('mongo caído')),
    );

    await expect(service.sweep()).resolves.toBe(0);
  });

  it('barre al arrancar y luego en cada intervalo', async () => {
    process.env.BATCH_EXPIRY_SWEEP_INTERVAL_MS = '1000';
    const { service, syncExpiredStatuses } = createHarness();

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncExpiredStatuses).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(syncExpiredStatuses).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(syncExpiredStatuses).toHaveBeenCalledTimes(2);
  });

  it('no programa barridos si el intervalo es 0', async () => {
    process.env.BATCH_EXPIRY_SWEEP_INTERVAL_MS = '0';
    const { service, syncExpiredStatuses } = createHarness();

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120000);

    expect(syncExpiredStatuses).not.toHaveBeenCalled();
  });
});
