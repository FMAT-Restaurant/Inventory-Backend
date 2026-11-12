import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { WasteService } from './waste.service.js';
import { ReservationStatus } from './schemas/stock-reservation.schema.js';
import { StockMovementType } from '../stock-movement/schemas/stock-movement.schema.js';

const BATCH_ID = '507f1f77bcf86cd799439011';

describe('WasteService', () => {
  const reservationFindOne = vi.fn();
  const stockMovementService = {
    findAll: vi.fn(),
    record: vi.fn(),
  };
  let service: WasteService;

  const dto = {
    orderId: 'O-1',
    batchId: BATCH_ID,
    quantity: 0.5,
    reason: 'Platillo devuelto',
  };

  function movements(out: number[], waste: number[] = []) {
    stockMovementService.findAll.mockImplementation(
      async ({ movementType }: { movementType: StockMovementType }) =>
        (movementType === StockMovementType.OUT ? out : waste).map(
          (quantity) => ({ quantity }),
        ),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    reservationFindOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ status: ReservationStatus.CONSUMED }),
    });
    stockMovementService.record.mockImplementation(async (input) => input);
    service = new WasteService(
      { findOne: reservationFindOne } as never,
      stockMovementService as never,
    );
  });

  it('registra la merma de una orden servida sin tocar el stock', async () => {
    movements([2]);

    const result = await service.register(dto, 'staff-7');

    expect(stockMovementService.record).toHaveBeenCalledWith({
      batchId: BATCH_ID,
      movementType: StockMovementType.WASTE,
      quantity: 0.5,
      referenceId: 'O-1',
      reason: 'Platillo devuelto',
      createdBy: 'staff-7',
    });
    expect(result).toMatchObject({ movementType: StockMovementType.WASTE });
  });

  it.each([null, { status: ReservationStatus.PENDING }])(
    'rechaza registrar merma de una orden no servida (%j)',
    async (current) => {
      reservationFindOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(current),
      });

      await expect(service.register(dto, 'staff-7')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(stockMovementService.record).not.toHaveBeenCalled();
    },
  );

  it('rechaza un lote que la orden no consumió', async () => {
    movements([]);

    await expect(service.register(dto, 'staff-7')).rejects.toThrow(
      'no fue consumido',
    );
  });

  it('no permite registrar más merma que lo consumido, contando mermas previas', async () => {
    movements([2], [1.8]);

    await expect(service.register(dto, 'staff-7')).rejects.toThrow(
      'disponible para merma: 0.2',
    );
    expect(stockMovementService.record).not.toHaveBeenCalled();
  });
});
