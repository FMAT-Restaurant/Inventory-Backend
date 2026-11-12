import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BatchService } from './batch.service.js';

const SUPPLIER_ID = '507f1f77bcf86cd799439011';
const ITEM_ID = '60d5ec9af682fbd39a1b865b';

describe('BatchService.getSupplierCostHistory', () => {
  const exec = vi.fn();
  const sort = vi.fn(() => ({ exec }));
  const batchModel = { find: vi.fn(() => ({ sort })) };
  const itemService = { findManyIncludingInactive: vi.fn() };
  const supplierService = { findOne: vi.fn() };
  let service: BatchService;

  beforeEach(() => {
    vi.clearAllMocks();
    supplierService.findOne.mockResolvedValue({ _id: SUPPLIER_ID });
    itemService.findManyIncludingInactive.mockResolvedValue(
      new Map([[ITEM_ID, { name: 'Queso', unit: 'g' }]]),
    );
    service = new BatchService(
      batchModel as never,
      itemService as never,
      {} as never,
      supplierService as never,
    );
  });

  it('lista las compras en orden cronológico con el costo de compra original', async () => {
    const first = new Date('2026-10-01');
    const second = new Date('2026-11-01');
    exec.mockResolvedValue([
      {
        _id: 'b1',
        batchNumber: 'L-1',
        itemId: ITEM_ID,
        initialQuantity: 100,
        cost: 9,
        purchaseCost: 7.5,
        createdAt: first,
      },
      {
        _id: 'b2',
        batchNumber: 'L-2',
        itemId: ITEM_ID,
        initialQuantity: 50,
        cost: 8,
        createdAt: second,
      },
    ]);

    const history = await service.getSupplierCostHistory(SUPPLIER_ID);

    expect(batchModel.find).toHaveBeenCalledWith({
      supplierId: { $in: [SUPPLIER_ID, new Types.ObjectId(SUPPLIER_ID)] },
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    expect(history).toEqual([
      expect.objectContaining({
        batchNumber: 'L-1',
        itemName: 'Queso',
        unit: 'g',
        quantity: 100,
        cost: 7.5,
        purchasedAt: first,
      }),
      // Lotes anteriores a `purchaseCost` usan el costo guardado.
      expect.objectContaining({ batchNumber: 'L-2', cost: 8 }),
    ]);
  });

  it('filtra por insumo', async () => {
    exec.mockResolvedValue([]);

    await service.getSupplierCostHistory(SUPPLIER_ID, ITEM_ID);

    expect(batchModel.find).toHaveBeenCalledWith({
      supplierId: { $in: [SUPPLIER_ID, new Types.ObjectId(SUPPLIER_ID)] },
      itemId: { $in: [ITEM_ID, new Types.ObjectId(ITEM_ID)] },
    });
  });

  it('responde 404 si el proveedor no existe', async () => {
    supplierService.findOne.mockRejectedValue(new NotFoundException());

    await expect(service.getSupplierCostHistory(SUPPLIER_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(batchModel.find).not.toHaveBeenCalled();
  });

  it('muestra un nombre genérico si el insumo ya no existe', async () => {
    itemService.findManyIncludingInactive.mockResolvedValue(new Map());
    exec.mockResolvedValue([
      {
        _id: 'b1',
        batchNumber: 'L-1',
        itemId: ITEM_ID,
        initialQuantity: 1,
        cost: 1,
      },
    ]);

    const [entry] = await service.getSupplierCostHistory(SUPPLIER_ID);

    expect(entry.itemName).toBe('Insumo no disponible');
  });
});
