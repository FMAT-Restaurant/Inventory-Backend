import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BatchController } from './batch.controller.js';
import { BatchService } from './batch.service.js';
import { BatchStatus } from './schemas/batch.schema.js';

describe('BatchController', () => {
  let controller: BatchController;
  let service: BatchService;

  const mockBatchId = '507f1f77bcf86cd799439011';
  const mockIngredientId = '60d5ec9af682fbd39a1b865b';

  const mockBatch = {
    _id: mockBatchId,
    batchNumber: 'LOTE-1',
    ingredientId: mockIngredientId,
    initialQuantity: 10,
    quantity: 10,
    cost: 15,
    expirationDate: new Date(),
    status: BatchStatus.ACTIVE,
  };

  const mockBatchService = {
    create: vi.fn().mockResolvedValue(mockBatch),
    findAll: vi.fn().mockResolvedValue([mockBatch]),
    findOne: vi.fn().mockResolvedValue(mockBatch),
    update: vi.fn().mockResolvedValue(mockBatch),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchController],
      providers: [
        {
          provide: BatchService,
          useValue: mockBatchService,
        },
      ],
    }).compile();

    controller = module.get<BatchController>(BatchController);
    service = module.get<BatchService>(BatchService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar un array de lotes', async () => {
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([mockBatch]);
    });

    it('debería pasar ingredientId al servicio cuando se provee', async () => {
      const result = await controller.findAll(mockIngredientId);
      expect(service.findAll).toHaveBeenCalledWith(mockIngredientId);
      expect(result).toEqual([mockBatch]);
    });
  });

  describe('findOne', () => {
    it('debería retornar un lote por su id', async () => {
      const result = await controller.findOne(mockBatchId);
      expect(service.findOne).toHaveBeenCalledWith(mockBatchId);
      expect(result).toEqual(mockBatch);
    });
  });

  describe('create', () => {
    it('debería crear un nuevo lote', async () => {
      const dto = {
        batchNumber: 'LOTE-1',
        ingredientId: mockIngredientId,
        quantity: 10,
        cost: 15,
        expirationDate: '2026-12-31',
      };
      const result = await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockBatch);
    });
  });

  describe('update', () => {
    it('debería actualizar un lote', async () => {
      const dto = { quantity: 50 };
      const result = await controller.update(mockBatchId, dto);
      expect(service.update).toHaveBeenCalledWith(mockBatchId, dto);
      expect(result).toEqual(mockBatch);
    });
  });

  describe('remove', () => {
    it('debería eliminar un lote', async () => {
      const result = await controller.remove(mockBatchId);
      expect(service.remove).toHaveBeenCalledWith(mockBatchId);
      expect(result).toBeUndefined();
    });
  });
});
