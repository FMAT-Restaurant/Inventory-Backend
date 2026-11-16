import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BatchService } from './batch.service.js';
import { BatchStatus } from './schemas/batch.schema.js';
import { StockMovementType } from '../stock-movement/schemas/stock-movement.schema.js';

const BATCH_ID = '507f1f77bcf86cd799439011';
const ITEM_ID = '60d5ec9af682fbd39a1b865b';

describe('BatchService.registerWaste', () => {
  const findByIdExec = vi.fn();
  const findOneAndUpdateExec = vi.fn();
  const find = vi.fn();
  const save = vi.fn();
  const batchModel = {
    findById: vi.fn(() => ({ exec: findByIdExec })),
    findOneAndUpdate: vi.fn(() => ({ exec: findOneAndUpdateExec })),
    find,
  };
  const itemService = { updateStockAndCost: vi.fn() };
  const stockMovementService = { record: vi.fn() };
  let service: BatchService;

  function batch(quantity: number) {
    return {
      _id: BATCH_ID,
      itemId: ITEM_ID,
      quantity,
      cost: 10,
      expirationDate: new Date('2099-12-31'),
      status: BatchStatus.ACTIVE,
      save,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdExec.mockResolvedValue(batch(10));
    find.mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });
    stockMovementService.record.mockResolvedValue({ _id: 'm1' });
    service = new BatchService(
      batchModel as never,
      itemService as never,
      stockMovementService as never,
      {} as never,
    );
  });

  it('descuenta la cantidad del lote y registra el movimiento de merma', async () => {
    findOneAndUpdateExec.mockResolvedValue(batch(7));

    const { batch: updated, movement } = await service.registerWaste(
      BATCH_ID,
      3,
      'Se cayó',
      'user-1',
    );

    expect(batchModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: BATCH_ID, quantity: { $gte: 3 } },
      { $inc: { quantity: -3 } },
      { new: true },
    );
    expect(updated.quantity).toBe(7);
    expect(updated.status).toBe(BatchStatus.ACTIVE);
    expect(stockMovementService.record).toHaveBeenCalledWith({
      batchId: BATCH_ID,
      movementType: StockMovementType.WASTE,
      quantity: 3,
      reason: 'Se cayó',
      createdBy: 'user-1',
    });
    expect(movement).toEqual({ _id: 'm1' });
    expect(itemService.updateStockAndCost).toHaveBeenCalledWith(
      ITEM_ID,
      0,
      undefined,
    );
  });

  it('marca el lote como agotado si la merma lo deja en cero', async () => {
    findOneAndUpdateExec.mockResolvedValue(batch(0));

    const { batch: updated } = await service.registerWaste(
      BATCH_ID,
      10,
      'Se echó a perder',
    );

    expect(updated.status).toBe(BatchStatus.DEPLETED);
    expect(save).toHaveBeenCalled();
  });

  it('rechaza una merma mayor a lo que queda en el lote', async () => {
    await expect(
      service.registerWaste(BATCH_ID, 11, 'x'),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(batchModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(stockMovementService.record).not.toHaveBeenCalled();
  });

  it('rechaza la merma si otra operación dejó sin stock el lote a la vez', async () => {
    findOneAndUpdateExec.mockResolvedValue(null);
    findByIdExec
      .mockResolvedValueOnce(batch(10))
      .mockResolvedValueOnce(batch(1));

    await expect(
      service.registerWaste(BATCH_ID, 5, 'x'),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(stockMovementService.record).not.toHaveBeenCalled();
  });

  it('rechaza una cantidad que no es positiva', async () => {
    await expect(service.registerWaste(BATCH_ID, 0, 'x')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('responde 404 si el lote no existe', async () => {
    findByIdExec.mockResolvedValue(null);

    await expect(service.registerWaste(BATCH_ID, 1, 'x')).rejects.toThrow(
      NotFoundException,
    );
  });
});
