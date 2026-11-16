import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessedEventService } from './processed-event.service.js';

describe('ProcessedEventService', () => {
  let service: ProcessedEventService;
  let model: {
    exists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
  };
  const existsExec = vi.fn();
  const deleteExec = vi.fn();
  const create = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    model = {
      exists: vi.fn().mockReturnValue({ exec: existsExec }),
      create,
      deleteOne: vi.fn().mockReturnValue({ exec: deleteExec }),
    };
    service = new ProcessedEventService(model as any);
  });

  it('detecta eventos ya procesados por consumidor y eventId', async () => {
    existsExec.mockResolvedValue({ _id: '1' });

    await expect(service.isProcessed('orders', 'E-1')).resolves.toBe(true);
    expect(model.exists).toHaveBeenCalledWith({
      consumer: 'orders',
      eventId: 'E-1',
    });
  });

  it('trata el duplicado de eventId como una operación idempotente', async () => {
    create.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

    await expect(
      service.markProcessed('orders', 'E-1'),
    ).resolves.toBeUndefined();
  });

  it('propaga errores distintos al duplicado', async () => {
    create.mockRejectedValue(new Error('write concern'));

    await expect(service.markProcessed('orders', 'E-1')).rejects.toThrow(
      'write concern',
    );
  });

  describe('claim', () => {
    it('devuelve true la primera vez que se reclama un evento', async () => {
      create.mockResolvedValue({});

      await expect(service.claim('orders', 'E-1')).resolves.toBe(true);
    });

    it('devuelve false si otra copia ya reclamó el evento', async () => {
      create.mockRejectedValue(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );

      await expect(service.claim('orders', 'E-1')).resolves.toBe(false);
    });

    it('propaga errores distintos al duplicado', async () => {
      create.mockRejectedValue(new Error('write concern'));

      await expect(service.claim('orders', 'E-1')).rejects.toThrow(
        'write concern',
      );
    });

    it('release devuelve el evento para poder reintentarlo', async () => {
      deleteExec.mockResolvedValue({});

      await service.release('orders', 'E-1');

      expect(model.deleteOne).toHaveBeenCalledWith({
        consumer: 'orders',
        eventId: 'E-1',
      });
    });
  });
});
