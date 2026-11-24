import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BatchService } from './batch.service.js';
import { Batch, BatchStatus } from './schemas/batch.schema.js';
import { ItemService } from '../item/item.service.js';
import { SupplierService } from '../suppliers/supplier.service.js';
import { StockMovementService } from '../stock-movement/stock-movement.service.js';
import { StockMovementType } from '../stock-movement/schemas/stock-movement.schema.js';

describe('BatchService', () => {
  let service: BatchService;
  let itemService: ItemService;

  const mockExecFind = vi.fn();
  const mockExecFindById = vi.fn();
  const mockExecFindByIdAndUpdate = vi.fn();
  const mockExecFindOneAndUpdate = vi.fn();
  const mockExecDeleteOne = vi.fn();
  const mockExecUpdateOne = vi.fn();
  const mockExecCount = vi.fn();
  const mockSave = vi.fn();

  const mockBatchId = '507f1f77bcf86cd799439011';
  const mockItemId = '60d5ec9af682fbd39a1b865b';
  const futureExpirationDate = '2099-12-31';

  const mockCreateDto = {
    batchNumber: 'LOTE-1',
    itemId: mockItemId,
    quantity: 10,
    cost: 15,
    expirationDate: futureExpirationDate,
  };

  const mockBatch = {
    _id: mockBatchId,
    batchNumber: 'LOTE-1',
    itemId: mockItemId,
    initialQuantity: 10,
    quantity: 10,
    cost: 15,
    expirationDate: new Date(futureExpirationDate),
    status: BatchStatus.ACTIVE,
  };

  function MockModel(
    this: Record<string, unknown>,
    dto: Record<string, unknown>,
  ) {
    Object.assign(this, dto);
    this.save = () => mockSave(this);
  }
  const findChain = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    exec: mockExecFind,
  };
  findChain.sort.mockReturnValue(findChain);
  findChain.skip.mockReturnValue(findChain);
  findChain.limit.mockReturnValue(findChain);
  MockModel.find = vi.fn().mockReturnValue(findChain);
  MockModel.countDocuments = vi.fn().mockReturnValue({ exec: mockExecCount });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.findByIdAndUpdate = vi
    .fn()
    .mockReturnValue({ exec: mockExecFindByIdAndUpdate });
  MockModel.findOneAndUpdate = vi
    .fn()
    .mockReturnValue({ exec: mockExecFindOneAndUpdate });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });
  MockModel.updateOne = vi.fn().mockReturnValue({ exec: mockExecUpdateOne });

  const mockItemService = {
    findOne: vi.fn().mockResolvedValue({ _id: mockItemId }),
    updateStockAndCost: vi.fn().mockResolvedValue({ _id: mockItemId }),
  };

  const mockStockMovementService = {
    record: vi.fn().mockResolvedValue({}),
  };

  const mockSupplierService = {
    assertAssignable: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecFind.mockResolvedValue([mockBatch]);
    mockExecCount.mockResolvedValue(1);
    findChain.sort.mockReturnValue(findChain);
    findChain.skip.mockReturnValue(findChain);
    findChain.limit.mockReturnValue(findChain);
    MockModel.find.mockReturnValue(findChain);
    MockModel.countDocuments.mockReturnValue({ exec: mockExecCount });
    mockSave.mockImplementation(async (doc: Record<string, unknown>) => ({
      _id: mockBatchId,
      ...doc,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchService,
        {
          provide: getModelToken(Batch.name),
          useValue: MockModel,
        },
        {
          provide: ItemService,
          useValue: mockItemService,
        },
        {
          provide: StockMovementService,
          useValue: mockStockMovementService,
        },
        {
          provide: SupplierService,
          useValue: mockSupplierService,
        },
      ],
    }).compile();

    service = module.get<BatchService>(BatchService);
    itemService = module.get<ItemService>(ItemService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create (no perecederos vs perecederos)', () => {
    it('permite crear un lote sin fecha de caducidad para insumos no perecederos y lo deja ACTIVE', async () => {
      mockItemService.findOne.mockResolvedValueOnce({
        _id: mockItemId,
        sku: 'UTC-01',
        isPerishable: false,
      });

      const result = await service.create({
        itemId: mockItemId,
        quantity: 50,
        cost: 1.5,
      });

      expect(result.status).toBe(BatchStatus.ACTIVE);
      expect(result.expirationDate).toBeNull();
    });

    it('rechaza crear un lote sin fecha de caducidad si el insumo es perecedero', async () => {
      mockItemService.findOne.mockResolvedValueOnce({
        _id: mockItemId,
        sku: 'VER-01',
        isPerishable: true,
      });

      await expect(
        service.create({
          itemId: mockItemId,
          quantity: 10,
          cost: 15,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('debería retornar una lista paginada de lotes', async () => {
      const result = await service.findAll();
      expect(MockModel.countDocuments).toHaveBeenCalledWith({});
      expect(MockModel.find).toHaveBeenCalledWith({});
      expect(result).toEqual({
        items: [mockBatch],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('debería filtrar por itemId cuando es válido', async () => {
      const result = await service.findAll({ itemId: mockItemId });
      expect(MockModel.countDocuments).toHaveBeenCalledWith({ itemId: mockItemId });
      expect(MockModel.find).toHaveBeenCalledWith({ itemId: mockItemId });
      expect(result.items).toEqual([mockBatch]);
    });

    it('debería retornar resultado vacío si itemId no es ObjectId válido', async () => {
      const result = await service.findAll({ itemId: 'invalido' });
      expect(MockModel.find).not.toHaveBeenCalled();
      expect(MockModel.countDocuments).not.toHaveBeenCalled();
      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });

  describe('findOne', () => {
    it('debería retornar un lote si existe', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);

      const result = await service.findOne(mockBatchId);
      expect(MockModel.findById).toHaveBeenCalledWith(mockBatchId);
      expect(result).toEqual(mockBatch);
    });

    it('debería lanzar NotFoundException si no existe el lote', async () => {
      mockExecFindById.mockResolvedValue(null);
      await expect(service.findOne(mockBatchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.findOne('id-invalido')).rejects.toThrow(
        NotFoundException,
      );
      expect(MockModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('debería validar el item y sincronizar su stock al crear un lote', async () => {
      const findOneSpy = vi.spyOn(itemService, 'findOne');
      const syncSpy = vi.spyOn(itemService, 'updateStockAndCost');

      await service.create(mockCreateDto);

      expect(findOneSpy).toHaveBeenCalledWith(mockItemId);
      expect(syncSpy).toHaveBeenCalledWith(mockItemId, 10, 15);
    });

    it('debería lanzar NotFoundException si el item no existe', async () => {
      vi.spyOn(itemService, 'findOne').mockRejectedValueOnce(
        new NotFoundException(),
      );

      await expect(service.create(mockCreateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería crear y guardar un lote asignando initialQuantity y status activo', async () => {
      const result = await service.create(mockCreateDto);

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        batchNumber: mockCreateDto.batchNumber,
        initialQuantity: mockCreateDto.quantity,
        quantity: mockCreateDto.quantity,
        cost: mockCreateDto.cost,
        status: BatchStatus.ACTIVE,
      });
    });

    it('debería autogenerar batchNumber si no se proporciona', async () => {
      const { batchNumber: _ignored, ...dtoWithoutNumber } = mockCreateDto;
      const result = await service.create(dtoWithoutNumber);

      expect(result.batchNumber).toMatch(/^LOT-\d{8}-[A-F0-9]{4}$/);
    });

    it('debería combinar el SKU del item con el número de lote manual y autogenerado', async () => {
      vi.spyOn(itemService, 'findOne').mockResolvedValueOnce({
        _id: mockItemId,
        sku: 'ING-0001',
      } as never);

      const manualResult = await service.create(mockCreateDto);
      expect(manualResult.batchNumber).toBe('ING-0001-LOTE-1');

      vi.spyOn(itemService, 'findOne').mockResolvedValueOnce({
        _id: mockItemId,
        sku: 'ING-0001',
      } as never);

      const { batchNumber: _ignored, ...dtoWithoutNumber } = mockCreateDto;
      const autoResult = await service.create(dtoWithoutNumber);
      expect(autoResult.batchNumber).toMatch(
        /^ING-0001-LOT-\d{8}-[A-F0-9]{4}$/,
      );
    });

    it.each([
      [
        'depleted cuando quantity es 0',
        { ...mockCreateDto, quantity: 0 },
        BatchStatus.DEPLETED,
      ],
      [
        'expired cuando la fecha ya pasó',
        { ...mockCreateDto, expirationDate: '2020-01-01' },
        BatchStatus.EXPIRED,
      ],
      [
        'expires_today cuando vence hoy',
        {
          ...mockCreateDto,
          expirationDate: new Date().toISOString().slice(0, 10),
        },
        BatchStatus.EXPIRES_TODAY,
      ],
    ])('debería asignar status %s', async (_label, dto, expectedStatus) => {
      const result = await service.create(dto);
      expect(result.status).toBe(expectedStatus);
    });

    it('debería rechazar un proveedor inexistente o dado de baja', async () => {
      mockSupplierService.assertAssignable.mockRejectedValueOnce(
        new NotFoundException(),
      );

      await expect(
        service.create({ ...mockCreateDto, supplierId: mockBatchId }),
      ).rejects.toThrow(NotFoundException);
      expect(mockSupplierService.assertAssignable).toHaveBeenCalledWith(
        mockBatchId,
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería lanzar ConflictException si el numero de lote ya existe', async () => {
      const duplicateKeyError = Object.assign(
        new Error('E11000 duplicate key'),
        { code: 11000 },
      );
      mockSave.mockRejectedValueOnce(duplicateKeyError);

      await expect(service.create(mockCreateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    const updateDto = { quantity: 50 };
    const updatedBatch = {
      ...mockBatch,
      ...updateDto,
      status: BatchStatus.ACTIVE,
    };

    it('debería actualizar un lote, recalcular su status y sincronizar el item', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockExecFindByIdAndUpdate.mockResolvedValue(updatedBatch);

      const result = await service.update(mockBatchId, updateDto);
      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockBatchId,
        { ...updateDto, initialQuantity: 50, status: BatchStatus.ACTIVE },
        { new: true },
      );
      expect(itemService.updateStockAndCost).toHaveBeenCalled();
      expect(result).toEqual(updatedBatch);
    });

    it('debería lanzar NotFoundException si el lote no existe', async () => {
      mockExecFindById.mockResolvedValue(null);
      await expect(service.update(mockBatchId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar BadRequestException si no hay campos para actualizar', async () => {
      await expect(
        service.update(mockBatchId, { reason: undefined }),
      ).rejects.toThrow(BadRequestException);
      expect(MockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería bloquear la edición de un lote agotado', async () => {
      mockExecFindById.mockResolvedValue({
        ...mockBatch,
        quantity: 0,
        status: BatchStatus.DEPLETED,
      });

      await expect(
        service.update(mockBatchId, { quantity: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect(MockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería bloquear edición de lote caducado salvo baja a cantidad 0', async () => {
      const expiredBatch = {
        ...mockBatch,
        expirationDate: new Date('2020-01-01'),
        status: BatchStatus.EXPIRED,
      };
      mockExecFindById.mockResolvedValue(expiredBatch);

      await expect(
        service.update(mockBatchId, { cost: 20 }),
      ).rejects.toThrow(BadRequestException);
      expect(MockModel.findByIdAndUpdate).not.toHaveBeenCalled();

      mockExecFindByIdAndUpdate.mockResolvedValue({
        ...expiredBatch,
        quantity: 0,
        status: BatchStatus.DEPLETED,
      });
      await expect(
        service.update(mockBatchId, { quantity: 0, reason: 'Baja por merma' }),
      ).resolves.toBeDefined();
      expect(mockStockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: mockBatchId,
          movementType: StockMovementType.WASTE,
          quantity: expiredBatch.quantity,
          reason: 'Baja por merma',
        }),
      );
    });

    it('debería lanzar ConflictException si reducir el lote deja menos stock del reservado', async () => {
      mockExecFindById.mockResolvedValue(mockBatch); // quantity: 10
      mockItemService.findOne.mockResolvedValueOnce({
        _id: mockItemId,
        reservedStock: 8,
      });
      mockExecFind.mockResolvedValueOnce([mockBatch]);

      await expect(
        service.update(mockBatchId, { quantity: 5 }),
      ).rejects.toThrow(ConflictException);
      expect(MockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería bloquear cambios a cost, supplierId o batchNumber si el lote ya tiene consumo', async () => {
      mockExecFindById.mockResolvedValue({
        ...mockBatch,
        initialQuantity: 10,
        quantity: 6,
      });

      await expect(
        service.update(mockBatchId, { cost: 25 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update(mockBatchId, { supplierId: '60d5ec9af682fbd39a1b865c' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update(mockBatchId, { batchNumber: 'NUEVO-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(MockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería rechazar expirationDate anterior a la fecha de ingreso del lote', async () => {
      mockExecFindById.mockResolvedValue({
        ...mockBatch,
        createdAt: new Date('2026-11-23T12:00:00.000Z'),
      });

      await expect(
        service.update(mockBatchId, { expirationDate: '2026-11-20' }),
      ).rejects.toThrow(BadRequestException);
      expect(MockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería permitir quitar expirationDate en no perecedero y rechazarlo en perecedero', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockItemService.findOne.mockResolvedValueOnce({
        _id: mockItemId,
        isPerishable: true,
      });

      await expect(
        service.update(mockBatchId, { expirationDate: null }),
      ).rejects.toThrow(BadRequestException);

      mockItemService.findOne.mockResolvedValueOnce({
        _id: mockItemId,
        isPerishable: false,
      });
      mockExecFindByIdAndUpdate.mockResolvedValueOnce({
        ...mockBatch,
        expirationDate: null,
      });

      await expect(
        service.update(mockBatchId, { expirationDate: null }),
      ).resolves.toBeDefined();
    });

    it('debería validar proveedor al cambiar supplierId y lanzar ConflictException si batchNumber choca', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockItemService.findOne.mockResolvedValueOnce({
        _id: mockItemId,
        sku: 'TOM-01',
      });
      mockExecFindByIdAndUpdate.mockRejectedValueOnce(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
      );

      await expect(
        service.update(mockBatchId, {
          supplierId: '60d5ec9af682fbd39a1b865c',
          batchNumber: 'DUP-01',
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockSupplierService.assertAssignable).toHaveBeenCalledWith(
        '60d5ec9af682fbd39a1b865c',
      );
    });
  });

  describe('remove', () => {
    it('debería eliminar un lote y sincronizar el item', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 1 });
      await service.remove(mockBatchId);
      expect(MockModel.deleteOne).toHaveBeenCalledWith({ _id: mockBatchId });
      expect(itemService.updateStockAndCost).toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el lote no existe', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 0 });
      await expect(service.remove(mockBatchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería bloquear eliminación de lote caducado o agotado', async () => {
      mockExecFindById.mockResolvedValue({
        ...mockBatch,
        expirationDate: new Date('2020-01-01'),
        status: BatchStatus.EXPIRED,
      });

      await expect(service.remove(mockBatchId)).rejects.toThrow(
        BadRequestException,
      );
      expect(MockModel.deleteOne).not.toHaveBeenCalled();
    });

    it('debería bloquear eliminación de lote que ya tuvo consumo', async () => {
      mockExecFindById.mockResolvedValue({
        ...mockBatch,
        initialQuantity: 10,
        quantity: 6,
      });

      await expect(service.remove(mockBatchId)).rejects.toThrow(
        BadRequestException,
      );
      expect(MockModel.deleteOne).not.toHaveBeenCalled();
    });

    it('debería lanzar ConflictException si eliminar el lote afecta stock reservado', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockItemService.findOne.mockResolvedValueOnce({
        _id: mockItemId,
        reservedStock: 4,
      });
      mockExecFind.mockResolvedValueOnce([mockBatch]);

      await expect(service.remove(mockBatchId)).rejects.toThrow(
        ConflictException,
      );
      expect(MockModel.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('movimientos de stock', () => {
    it('registra un movimiento "in" al crear un lote con cantidad', async () => {
      await service.create(mockCreateDto);

      expect(mockStockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: mockBatchId,
          movementType: StockMovementType.IN,
          quantity: mockCreateDto.quantity,
          reason: 'Alta de lote',
        }),
      );
    });

    it('registra un ajuste firmado con el usuario del controlador al actualizar la cantidad', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockExecFindByIdAndUpdate.mockResolvedValue({
        ...mockBatch,
        quantity: 50,
      });

      await service.update(
        mockBatchId,
        {
          quantity: 50,
          reason: 'Conteo físico',
        },
        'chef-1',
      );

      expect(mockStockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: mockBatchId,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: 40,
          reason: 'Conteo físico',
          createdBy: 'chef-1',
        }),
      );
    });

    it('no registra movimiento si el ajuste no cambia la cantidad', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockExecFindByIdAndUpdate.mockResolvedValue(mockBatch);

      await service.update(mockBatchId, { cost: 20 });

      expect(mockStockMovementService.record).not.toHaveBeenCalled();
    });

    it('registra un ajuste negativo al eliminar un lote con existencia', async () => {
      mockExecFindById.mockResolvedValue(mockBatch);
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await service.remove(mockBatchId);

      expect(mockStockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: mockBatchId,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: -mockBatch.quantity,
          reason: 'Eliminación de lote',
        }),
      );
    });

    it('no falla la operación de stock si falla el registro del movimiento', async () => {
      mockStockMovementService.record.mockRejectedValueOnce(
        new Error('auditoría caída'),
      );

      await expect(service.create(mockCreateDto)).resolves.toBeDefined();
    });
  });

  describe('consumeByFefo', () => {
    function batchDoc(overrides: Record<string, unknown> = {}) {
      return {
        _id: `batch-${Math.random().toString(16).slice(2)}`,
        itemId: mockItemId,
        quantity: 1,
        cost: 10,
        expirationDate: new Date('2099-01-01'),
        status: BatchStatus.ACTIVE,
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    it('ignora itemId o cantidades inválidas', async () => {
      await service.consumeByFefo('invalido', 5);
      await service.consumeByFefo(mockItemId, 0);
      await service.consumeByFefo(mockItemId, Number.NaN);

      expect(MockModel.find).not.toHaveBeenCalled();
    });

    it('consume desde los lotes más próximos a vencer y registra movimientos', async () => {
      const expired = batchDoc({
        _id: 'expired',
        quantity: 5,
        expirationDate: new Date('2020-01-01'),
      });
      const first = batchDoc({
        _id: 'first',
        quantity: 3,
        cost: 10,
        expirationDate: new Date('2099-01-01'),
      });
      const second = batchDoc({
        _id: 'second',
        quantity: 5,
        cost: 20,
        expirationDate: new Date('2099-02-01'),
      });

      const firstAfter = batchDoc({
        _id: 'first',
        quantity: 0,
        cost: 10,
        expirationDate: new Date('2099-01-01'),
        status: BatchStatus.ACTIVE,
      });
      const secondAfter = batchDoc({
        _id: 'second',
        quantity: 2,
        cost: 20,
        expirationDate: new Date('2099-02-01'),
        status: BatchStatus.ACTIVE,
      });

      mockExecFind
        .mockResolvedValueOnce([expired, first, second])
        .mockResolvedValueOnce([
          { ...firstAfter, status: BatchStatus.DEPLETED },
          secondAfter,
        ]);
      mockExecFindOneAndUpdate
        .mockResolvedValueOnce(firstAfter)
        .mockResolvedValueOnce(secondAfter);

      await service.consumeByFefo(mockItemId, 6, 'ORD-1');

      expect(MockModel.find).toHaveBeenCalledWith({ itemId: mockItemId });
      expect(findChain.sort).toHaveBeenCalledWith({
        expirationDate: 1,
        _id: 1,
      });
      expect(MockModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        1,
        { _id: 'first', quantity: { $gte: 3 } },
        { $inc: { quantity: -3 } },
        { new: true },
      );
      expect(MockModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { _id: 'second', quantity: { $gte: 3 } },
        { $inc: { quantity: -3 } },
        { new: true },
      );
      expect(MockModel.updateOne).toHaveBeenCalledWith(
        { _id: 'first', quantity: { $lte: 0.0005 } },
        { $set: { status: BatchStatus.DEPLETED } },
      );

      expect(mockStockMovementService.record).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          batchId: 'first',
          movementType: StockMovementType.OUT,
          quantity: 3,
          referenceId: 'ORD-1',
          reason: 'Consumo por orden servida',
        }),
      );
      expect(mockStockMovementService.record).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          batchId: 'second',
          movementType: StockMovementType.OUT,
          quantity: 3,
          referenceId: 'ORD-1',
        }),
      );
      expect(mockItemService.updateStockAndCost).toHaveBeenCalledWith(
        mockItemId,
        2,
        20,
      );
    });

    it('deja de consumir cuando cubre la cantidad solicitada', async () => {
      const batch = batchDoc({ _id: 'only', quantity: 10 });
      const batchAfter = batchDoc({ _id: 'only', quantity: 6 });
      mockExecFind
        .mockResolvedValueOnce([batch])
        .mockResolvedValueOnce([batchAfter]);
      mockExecFindOneAndUpdate.mockResolvedValueOnce(batchAfter);

      await service.consumeByFefo(mockItemId, 4, undefined, 'Merma');

      expect(MockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'only', quantity: { $gte: 4 } },
        { $inc: { quantity: -4 } },
        { new: true },
      );
      expect(mockStockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 4,
          referenceId: null,
          reason: 'Merma',
        }),
      );
    });

    it('reintenta FEFO cuando otro consumo concurrente modifica el lote', async () => {
      const staleFirst = batchDoc({
        _id: 'first',
        quantity: 5,
        cost: 10,
        expirationDate: new Date('2099-01-01'),
      });
      const freshFirst = batchDoc({
        _id: 'first',
        quantity: 2,
        cost: 10,
        expirationDate: new Date('2099-01-01'),
      });
      const second = batchDoc({
        _id: 'second',
        quantity: 5,
        cost: 20,
        expirationDate: new Date('2099-02-01'),
      });
      const freshFirstAfter = batchDoc({
        _id: 'first',
        quantity: 0,
        cost: 10,
        expirationDate: new Date('2099-01-01'),
      });
      const secondAfter = batchDoc({
        _id: 'second',
        quantity: 3,
        cost: 20,
        expirationDate: new Date('2099-02-01'),
      });

      mockExecFind
        // Intento 1: encuentra staleFirst (5) pero contiende
        .mockResolvedValueOnce([staleFirst, second])
        // Intento 2: relee freshFirst (2) y second (5)
        .mockResolvedValueOnce([freshFirst, second])
        // Sincronización final de stock
        .mockResolvedValueOnce([
          { ...freshFirstAfter, status: BatchStatus.DEPLETED },
          secondAfter,
        ]);

      mockExecFindOneAndUpdate
        .mockResolvedValueOnce(null) // contención en intento 1
        .mockResolvedValueOnce(freshFirstAfter)
        .mockResolvedValueOnce(secondAfter);

      await service.consumeByFefo(mockItemId, 4, 'ORD-RACE');

      expect(MockModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        1,
        { _id: 'first', quantity: { $gte: 4 } },
        { $inc: { quantity: -4 } },
        { new: true },
      );
      expect(MockModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { _id: 'first', quantity: { $gte: 2 } },
        { $inc: { quantity: -2 } },
        { new: true },
      );
      expect(MockModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        3,
        { _id: 'second', quantity: { $gte: 2 } },
        { $inc: { quantity: -2 } },
        { new: true },
      );
      expect(mockStockMovementService.record).toHaveBeenCalledTimes(2);
    });

    it('omite lotes expirados o agotados y sincroniza stock en cero', async () => {
      const expired = batchDoc({
        _id: 'expired',
        quantity: 5,
        expirationDate: new Date('2020-01-01'),
      });
      const depleted = batchDoc({ _id: 'depleted', quantity: 0 });
      mockExecFind
        .mockResolvedValueOnce([expired, depleted])
        .mockResolvedValueOnce([]);

      await service.consumeByFefo(mockItemId, 2);

      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockStockMovementService.record).not.toHaveBeenCalled();
      expect(mockItemService.updateStockAndCost).toHaveBeenCalledWith(
        mockItemId,
        0,
        undefined,
      );
    });

    it('tolera que falle el registro de un movimiento', async () => {
      const batch = batchDoc({ _id: 'only', quantity: 5 });
      const batchAfter = batchDoc({ _id: 'only', quantity: 3 });
      mockExecFind
        .mockResolvedValueOnce([batch])
        .mockResolvedValueOnce([batchAfter]);
      mockExecFindOneAndUpdate.mockResolvedValueOnce(batchAfter);
      mockStockMovementService.record.mockRejectedValueOnce(
        new Error('auditoría caída'),
      );

      await expect(
        service.consumeByFefo(mockItemId, 2),
      ).resolves.toBeUndefined();

      expect(MockModel.findOneAndUpdate).toHaveBeenCalledOnce();
      expect(mockItemService.updateStockAndCost).toHaveBeenCalled();
    });

    it('consume lotes sin caducidad después de los que sí tienen fecha en previewFefoAllocation', async () => {
      const noExpiry = batchDoc({
        _id: 'no-exp',
        batchNumber: 'NO-EXP',
        quantity: 10,
        expirationDate: null,
      });
      const withExpiry = batchDoc({
        _id: 'with-exp',
        batchNumber: 'WITH-EXP',
        quantity: 3,
        expirationDate: new Date('2099-05-01'),
      });
      mockExecFind.mockResolvedValueOnce([noExpiry, withExpiry]);

      const plan = await service.previewFefoAllocation(mockItemId, 5);
      expect(plan).toEqual([
        {
          batchId: 'with-exp',
          batchNumber: 'WITH-EXP',
          expirationDate: '2099-05-01T00:00:00.000Z',
          quantity: 3,
        },
        {
          batchId: 'no-exp',
          batchNumber: 'NO-EXP',
          expirationDate: '',
          quantity: 2,
        },
      ]);
    });

    it('no sincroniza si el itemId no es un ObjectId válido', async () => {
      await (service as unknown as {
        syncItemStockAndCost: (id: string) => Promise<void>;
      }).syncItemStockAndCost('invalido');

      expect(MockModel.find).not.toHaveBeenCalled();
    });
  });

  describe('previewFefoAllocation', () => {
    function batchDoc(overrides: Record<string, unknown> = {}) {
      return {
        _id: `batch-${Math.random().toString(16).slice(2)}`,
        batchNumber: 'LOTE-X',
        itemId: mockItemId,
        quantity: 1,
        cost: 10,
        expirationDate: new Date('2099-01-01'),
        status: BatchStatus.ACTIVE,
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    it('ignora itemId o cantidades inválidas sin consultar lotes', async () => {
      await expect(
        service.previewFefoAllocation('invalido', 5),
      ).resolves.toEqual([]);
      await expect(service.previewFefoAllocation(mockItemId, 0)).resolves.toEqual(
        [],
      );
      await expect(
        service.previewFefoAllocation(mockItemId, Number.NaN),
      ).resolves.toEqual([]);

      expect(MockModel.find).not.toHaveBeenCalled();
    });

    it('divide entre lotes en orden FEFO sin mutarlos ni registrar movimientos', async () => {
      const first = batchDoc({
        _id: 'first',
        batchNumber: 'LOTE-1',
        quantity: 3,
        expirationDate: new Date('2099-01-01'),
      });
      const second = batchDoc({
        _id: 'second',
        batchNumber: 'LOTE-2',
        quantity: 5,
        expirationDate: new Date('2099-02-01'),
      });
      mockExecFind.mockResolvedValueOnce([first, second]);

      await expect(
        service.previewFefoAllocation(mockItemId, 4),
      ).resolves.toEqual([
        {
          batchId: 'first',
          batchNumber: 'LOTE-1',
          expirationDate: '2099-01-01T00:00:00.000Z',
          quantity: 3,
        },
        {
          batchId: 'second',
          batchNumber: 'LOTE-2',
          expirationDate: '2099-02-01T00:00:00.000Z',
          quantity: 1,
        },
      ]);

      expect(MockModel.find).toHaveBeenCalledWith({ itemId: mockItemId });
      expect(findChain.sort).toHaveBeenCalledWith({
        expirationDate: 1,
        _id: 1,
      });
      expect(first.quantity).toBe(3);
      expect(second.quantity).toBe(5);
      expect(first.save).not.toHaveBeenCalled();
      expect(second.save).not.toHaveBeenCalled();
      expect(mockStockMovementService.record).not.toHaveBeenCalled();
      expect(mockItemService.updateStockAndCost).not.toHaveBeenCalled();
    });

    it('omite lotes expirados o agotados', async () => {
      const expired = batchDoc({
        _id: 'expired',
        quantity: 5,
        expirationDate: new Date('2020-01-01'),
      });
      const depleted = batchDoc({ _id: 'depleted', quantity: 0 });
      const usable = batchDoc({
        _id: 'usable',
        batchNumber: 'LOTE-OK',
        quantity: 4,
      });
      mockExecFind.mockResolvedValueOnce([expired, depleted, usable]);

      await expect(
        service.previewFefoAllocation(mockItemId, 2),
      ).resolves.toEqual([
        {
          batchId: 'usable',
          batchNumber: 'LOTE-OK',
          expirationDate: '2099-01-01T00:00:00.000Z',
          quantity: 2,
        },
      ]);
    });

    it('incluye lotes que vencen hoy', async () => {
      const today = new Date();
      const expiringToday = batchDoc({
        _id: 'today',
        batchNumber: 'LOTE-HOY',
        quantity: 2,
        expirationDate: today,
      });
      mockExecFind.mockResolvedValueOnce([expiringToday]);

      await expect(
        service.previewFefoAllocation(mockItemId, 1),
      ).resolves.toEqual([
        {
          batchId: 'today',
          batchNumber: 'LOTE-HOY',
          expirationDate: today.toISOString(),
          quantity: 1,
        },
      ]);
    });

    it('devuelve solo lo alcanzable cuando los lotes no cubren la cantidad', async () => {
      const only = batchDoc({ _id: 'only', quantity: 2 });
      mockExecFind.mockResolvedValueOnce([only]);

      await expect(
        service.previewFefoAllocation(mockItemId, 10),
      ).resolves.toEqual([
        {
          batchId: 'only',
          batchNumber: 'LOTE-X',
          expirationDate: '2099-01-01T00:00:00.000Z',
          quantity: 2,
        },
      ]);
    });
  });

  describe('onModuleInit', () => {
    it('elimina el índice legado de batchNumber', async () => {
      const dropIndex = vi.fn().mockResolvedValue(undefined);
      (MockModel as unknown as { collection: unknown }).collection = {
        dropIndex,
      };

      await service.onModuleInit();

      expect(dropIndex).toHaveBeenCalledWith('batchNumber_1');
    });

    it('no falla si el índice legado no existe', async () => {
      const dropIndex = vi.fn().mockRejectedValue(new Error('index not found'));
      (MockModel as unknown as { collection: unknown }).collection = {
        dropIndex,
      };

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('syncExpiredStatuses', () => {
    const now = new Date('2026-11-10T15:00:00.000Z');

    it('marca como vencidos los lotes cuya fecha ya pasó y recalcula el stock del item', async () => {
      const expired = {
        ...mockBatch,
        _id: 'lote-vencido',
        expirationDate: new Date('2026-11-09'),
        status: BatchStatus.ACTIVE,
      };
      mockExecFind
        .mockResolvedValueOnce([expired])
        // Lotes del item al recalcular su stock
        .mockResolvedValueOnce([expired]);

      await expect(service.syncExpiredStatuses(now)).resolves.toBe(1);

      expect(MockModel.find).toHaveBeenCalledWith({
        status: { $in: [BatchStatus.ACTIVE, BatchStatus.EXPIRES_TODAY] },
        expirationDate: { $ne: null, $lt: new Date('2026-11-11T00:00:00.000Z') },
      });
      expect(MockModel.updateOne).toHaveBeenCalledWith(
        { _id: 'lote-vencido' },
        { status: BatchStatus.EXPIRED },
      );
      expect(mockStockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'lote-vencido',
          movementType: StockMovementType.WASTE,
          quantity: mockBatch.quantity,
          reason: 'Caducidad automática de lote',
          createdBy: 'system',
        }),
      );
      expect(itemService.updateStockAndCost).toHaveBeenCalledWith(
        mockItemId,
        0,
        undefined,
      );
    });

    it('no toca los lotes cuyo estado ya es correcto', async () => {
      mockExecFind.mockResolvedValueOnce([
        {
          ...mockBatch,
          expirationDate: new Date(),
          status: BatchStatus.EXPIRES_TODAY,
        },
      ]);

      await expect(service.syncExpiredStatuses()).resolves.toBe(0);
      expect(MockModel.updateOne).not.toHaveBeenCalled();
      expect(itemService.updateStockAndCost).not.toHaveBeenCalled();
    });

    it('continúa aunque falle el recálculo de un item', async () => {
      mockExecFind.mockResolvedValueOnce([
        {
          ...mockBatch,
          expirationDate: new Date('2026-11-09'),
          status: BatchStatus.ACTIVE,
        },
      ]);
      mockItemService.updateStockAndCost.mockRejectedValueOnce(
        new Error('item caído'),
      );

      await expect(service.syncExpiredStatuses(now)).resolves.toBe(1);
    });
  });
});
