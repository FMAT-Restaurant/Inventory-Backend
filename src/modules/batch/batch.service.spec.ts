import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BatchService } from './batch.service.js';
import { Batch, BatchStatus } from './schemas/batch.schema.js';
import { ItemService } from '../item/item.service.js';

describe('BatchService', () => {
  let service: BatchService;
  let itemService: ItemService;

  const mockExecFind = vi.fn();
  const mockExecFindById = vi.fn();
  const mockExecFindByIdAndUpdate = vi.fn();
  const mockExecDeleteOne = vi.fn();
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
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.findByIdAndUpdate = vi
    .fn()
    .mockReturnValue({ exec: mockExecFindByIdAndUpdate });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });

  const mockItemService = {
    findOne: vi.fn().mockResolvedValue({ _id: mockItemId }),
    updateStockAndCost: vi.fn().mockResolvedValue({ _id: mockItemId }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecFind.mockResolvedValue([mockBatch]);
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
      ],
    }).compile();

    service = module.get<BatchService>(BatchService);
    itemService = module.get<ItemService>(ItemService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar una lista de lotes', async () => {
      const result = await service.findAll();
      expect(MockModel.find).toHaveBeenCalledWith();
      expect(result).toEqual([mockBatch]);
    });

    it('debería filtrar por itemId cuando es válido', async () => {
      const result = await service.findAll(mockItemId);
      expect(MockModel.find).toHaveBeenCalledWith({ itemId: mockItemId });
      expect(result).toEqual([mockBatch]);
    });

    it('debería retornar arreglo vacío si itemId no es ObjectId válido', async () => {
      const result = await service.findAll('invalido');
      expect(MockModel.find).not.toHaveBeenCalled();
      expect(result).toEqual([]);
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
        { ...updateDto, status: BatchStatus.ACTIVE },
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
  });
});
