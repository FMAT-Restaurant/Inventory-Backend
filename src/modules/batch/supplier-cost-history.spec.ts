import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BatchService } from './batch.service.js';

const SUPPLIER_ID = '507f1f77bcf86cd799439011';
const ITEM_ID = '60d5ec9af682fbd39a1b865b';
const OTHER_ITEM_ID = '60d5ec9af682fbd39a1b865c';

const BASE_FILTER = {
  supplierId: { $in: [SUPPLIER_ID, new Types.ObjectId(SUPPLIER_ID)] },
};

describe('BatchService.getSupplierCostHistory', () => {
  const findExec = vi.fn();
  const limit = vi.fn(() => ({ exec: findExec }));
  const skip = vi.fn(() => ({ limit }));
  const sort = vi.fn(() => ({ skip }));
  const countExec = vi.fn();
  const distinctExec = vi.fn();
  const batchModel = {
    find: vi.fn(() => ({ sort })),
    countDocuments: vi.fn(() => ({ exec: countExec })),
    distinct: vi.fn(() => ({ exec: distinctExec })),
  };
  const itemService = { findManyIncludingInactive: vi.fn() };
  const supplierService = { findOne: vi.fn() };
  let service: BatchService;

  function batch(overrides: Record<string, unknown> = {}) {
    return {
      _id: 'b1',
      batchNumber: 'L-1',
      itemId: ITEM_ID,
      initialQuantity: 100,
      cost: 9,
      createdAt: new Date('2026-10-01'),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    supplierService.findOne.mockResolvedValue({ _id: SUPPLIER_ID });
    itemService.findManyIncludingInactive.mockResolvedValue(
      new Map([
        [ITEM_ID, { name: 'Queso', unit: 'g' }],
        [OTHER_ITEM_ID, { name: 'Aceite', unit: 'l' }],
      ]),
    );
    countExec.mockResolvedValue(1);
    findExec.mockResolvedValue([batch()]);
    distinctExec.mockResolvedValue([ITEM_ID]);
    service = new BatchService(
      batchModel as never,
      itemService as never,
      {} as never,
      supplierService as never,
    );
  });

  it('muestra primero la compra más reciente y pagina de 20 en 20 por defecto', async () => {
    const result = await service.getSupplierCostHistory(SUPPLIER_ID);

    expect(batchModel.countDocuments).toHaveBeenCalledWith(BASE_FILTER);
    expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('usa el costo de compra original y el de lotes anteriores como respaldo', async () => {
    findExec.mockResolvedValue([
      batch({ _id: 'b2', batchNumber: 'L-2', cost: 8 }),
      batch({ purchaseCost: 7.5, cost: 9 }),
    ]);

    const { items } = await service.getSupplierCostHistory(SUPPLIER_ID);

    expect(items).toEqual([
      expect.objectContaining({
        batchNumber: 'L-2',
        cost: 8,
        itemName: 'Queso',
        unit: 'g',
        quantity: 100,
      }),
      expect.objectContaining({ batchNumber: 'L-1', cost: 7.5 }),
    ]);
  });

  it('ordena de la más antigua a la más reciente con order=asc', async () => {
    await service.getSupplierCostHistory(SUPPLIER_ID, { order: 'asc' });

    expect(sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  it('calcula las páginas y salta los registros de las anteriores', async () => {
    countExec.mockResolvedValue(25);

    const result = await service.getSupplierCostHistory(SUPPLIER_ID, {
      page: 2,
      limit: 10,
    });

    expect(skip).toHaveBeenCalledWith(10);
    expect(limit).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });

  it('ajusta una página fuera de rango a la última', async () => {
    countExec.mockResolvedValue(25);

    const result = await service.getSupplierCostHistory(SUPPLIER_ID, {
      page: 99,
      limit: 10,
    });

    expect(result.page).toBe(3);
    expect(skip).toHaveBeenCalledWith(20);
  });

  it('limita el tamaño de página y no falla sin resultados', async () => {
    countExec.mockResolvedValue(0);
    findExec.mockResolvedValue([]);

    const result = await service.getSupplierCostHistory(SUPPLIER_ID, {
      limit: 5000,
    });

    expect(limit).toHaveBeenCalledWith(100);
    expect(result).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      totalPages: 1,
    });
  });

  it('filtra por insumo en ambos formatos de id', async () => {
    await service.getSupplierCostHistory(SUPPLIER_ID, { itemId: ITEM_ID });

    expect(batchModel.countDocuments).toHaveBeenCalledWith({
      ...BASE_FILTER,
      itemId: { $in: [ITEM_ID, new Types.ObjectId(ITEM_ID)] },
    });
  });

  it('una fecha final sin hora incluye todo ese día', async () => {
    await service.getSupplierCostHistory(SUPPLIER_ID, {
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(batchModel.countDocuments).toHaveBeenCalledWith({
      ...BASE_FILTER,
      createdAt: {
        $gte: new Date('2026-11-01T00:00:00.000Z'),
        $lt: new Date('2026-12-01T00:00:00.000Z'),
      },
    });
  });

  it('una fecha final con hora se respeta tal cual', async () => {
    await service.getSupplierCostHistory(SUPPLIER_ID, {
      to: '2026-11-30T12:00:00.000Z',
    });

    expect(batchModel.countDocuments).toHaveBeenCalledWith({
      ...BASE_FILTER,
      createdAt: { $lte: new Date('2026-11-30T12:00:00.000Z') },
    });
  });

  it('rechaza una fecha inicial posterior a la final', async () => {
    await expect(
      service.getSupplierCostHistory(SUPPLIER_ID, {
        from: '2026-12-01',
        to: '2026-11-01',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(batchModel.countDocuments).not.toHaveBeenCalled();
  });

  it('lista los insumos surtidos, sin aplicar los demás filtros, ordenados por nombre', async () => {
    distinctExec.mockResolvedValue([ITEM_ID, OTHER_ITEM_ID]);

    const { filters } = await service.getSupplierCostHistory(SUPPLIER_ID, {
      itemId: ITEM_ID,
    });

    expect(batchModel.distinct).toHaveBeenCalledWith('itemId', BASE_FILTER);
    expect(filters.items).toEqual([
      { itemId: OTHER_ITEM_ID, itemName: 'Aceite', unit: 'l' },
      { itemId: ITEM_ID, itemName: 'Queso', unit: 'g' },
    ]);
  });

  it('responde 404 si el proveedor no existe', async () => {
    supplierService.findOne.mockRejectedValue(new NotFoundException());

    await expect(service.getSupplierCostHistory(SUPPLIER_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(batchModel.countDocuments).not.toHaveBeenCalled();
  });

  it('muestra un nombre genérico si el insumo ya no existe', async () => {
    itemService.findManyIncludingInactive.mockResolvedValue(new Map());

    const { items, filters } =
      await service.getSupplierCostHistory(SUPPLIER_ID);

    expect(items[0].itemName).toBe('Insumo no disponible');
    expect(filters.items[0].itemName).toBe('Insumo no disponible');
  });
});
