import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationExpiryService } from './reservation-expiry.service.js';

function createHarness(expireDue = vi.fn().mockResolvedValue(0)) {
  const service = new ReservationExpiryService({
    expireDue,
  } as never);
  return { service, expireDue };
}

describe('ReservationExpiryService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RESERVATION_SWEEP_INTERVAL_MS;
  });

  describe('sweep', () => {
    it('libera las reservas vencidas y devuelve el conteo', async () => {
      const { service, expireDue } = createHarness(
        vi.fn().mockResolvedValue(3),
      );

      await expect(service.sweep()).resolves.toBe(3);
      expect(expireDue).toHaveBeenCalledOnce();
    });

    it('devuelve 0 y no propaga errores al expirar', async () => {
      const { service } = createHarness(
        vi.fn().mockRejectedValue(new Error('mongo caído')),
      );

      await expect(service.sweep()).resolves.toBe(0);
    });

    it('evita barridos concurrentes', async () => {
      let resolveSweep: (value: number) => void = () => undefined;
      const expireDue = vi.fn().mockReturnValue(
        new Promise<number>((resolve) => {
          resolveSweep = resolve;
        }),
      );
      const { service } = createHarness(expireDue);

      const first = service.sweep();
      await expect(service.sweep()).resolves.toBe(0);

      resolveSweep(2);
      await expect(first).resolves.toBe(2);
      expect(expireDue).toHaveBeenCalledOnce();
    });
  });

  describe('onModuleInit', () => {
    it('agenda el barrido periódico según la configuración', async () => {
      process.env.RESERVATION_SWEEP_INTERVAL_MS = '1000';
      const { service, expireDue } = createHarness(
        vi.fn().mockResolvedValue(1),
      );

      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(1000);

      expect(expireDue).toHaveBeenCalledOnce();
    });

    it('deshabilita el barrido cuando el intervalo es 0', async () => {
      process.env.RESERVATION_SWEEP_INTERVAL_MS = '0';
      const { service, expireDue } = createHarness();

      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(5000);

      expect(expireDue).not.toHaveBeenCalled();
    });

    it('usa el intervalo por defecto si la variable es inválida', async () => {
      process.env.RESERVATION_SWEEP_INTERVAL_MS = 'no-es-numero';
      const { service, expireDue } = createHarness();

      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(59999);
      expect(expireDue).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(expireDue).toHaveBeenCalledOnce();
    });
  });

  describe('onModuleDestroy', () => {
    it('cancela el timer activo', async () => {
      process.env.RESERVATION_SWEEP_INTERVAL_MS = '1000';
      const { service, expireDue } = createHarness();

      service.onModuleInit();
      service.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(5000);

      expect(expireDue).not.toHaveBeenCalled();
    });

    it('no falla si nunca se inicializó', () => {
      const { service } = createHarness();

      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
