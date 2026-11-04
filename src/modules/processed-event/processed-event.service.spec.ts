import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessedEventService } from './processed-event.service.js';

describe('ProcessedEventService', () => {
  let service: ProcessedEventService;
  let model: { exists: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  const existsExec = vi.fn();
  const create = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    model = {
      exists: vi.fn().mockReturnValue({ exec: existsExec }),
      create,
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
});
