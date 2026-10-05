import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BatchController } from './batch.controller.js';
import { BatchService } from './batch.service.js';
import { BatchStatus } from './schemas/batch.schema.js';

describe('BatchController', () => {
  let controller: BatchController;
  let service: BatchService;

  const mockBatch = {
    _id: '507f1f77bcf86cd799439011',
    batchNumber: 'LOTE-1',
    ingredientId: '60d5ec9af682fbd39a1b865b',
    quantity: 10,
    cost: 15,
    expirationDate: new Date(),
    status: BatchStatus.ACTIVE
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
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockBatch]);
    });
  });

  describe('findOne', () => {
    it('debería retornar un lote por su id', async () => {
      const result = await controller.findOne('507f1f77bcf86cd799439011');
      expect(service.findOne).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockBatch);
    });
  });

  describe('create', () => {
    it('debería crear un nuevo lote', async () => {
      const dto = { batchNumber: 'LOTE-1', ingredientId: '60d5ec9af682fbd39a1b865b', quantity: 10, cost: 15, expirationDate: '2025-12-31' };
      const result = await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockBatch);
    });
  });

  describe('update', () => {
    it('debería actualizar un lote', async () => {
      const dto = { quantity: 50 };
      const result = await controller.update('507f1f77bcf86cd799439011', dto);
      expect(service.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', dto);
      expect(result).toEqual(mockBatch);
    });
  });

  describe('remove', () => {
    it('debería eliminar un lote', async () => {
      const result = await controller.remove('507f1f77bcf86cd799439011');
      expect(service.remove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toBeUndefined();
    });
  });
});
