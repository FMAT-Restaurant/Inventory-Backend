import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BatchService } from './batch.service.js';
import { Batch, BatchStatus } from './schemas/batch.schema.js';
import { IngredientService } from '../ingredient/ingredient.service.js';

describe('BatchService', () => {
  let service: BatchService;
  let ingredientService: IngredientService;

  const mockExecFind = vi.fn();
  const mockExecFindById = vi.fn();
  const mockExecFindByIdAndUpdate = vi.fn();
  const mockExecDeleteOne = vi.fn();
  const mockSave = vi.fn();

  const mockBatchId = '507f1f77bcf86cd799439011';
  const mockIngredientId = '60d5ec9af682fbd39a1b865b';

  const mockCreateDto = {
    batchNumber: 'LOTE-1',
    ingredientId: mockIngredientId,
    quantity: 10,
    cost: 15,
    expirationDate: '2025-12-31',
  };

  const mockBatch = {
    _id: mockBatchId,
    batchNumber: 'LOTE-1',
    quantity: 10,
    cost: 15,
    expirationDate: new Date(),
    status: BatchStatus.ACTIVE,
  };

  function MockModel(this: any, dto: any) {
    Object.assign(this, dto);
    this.save = mockSave;
  }
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.findByIdAndUpdate = vi.fn().mockReturnValue({ exec: mockExecFindByIdAndUpdate });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });

  const mockIngredientService = {
    findOne: vi.fn().mockResolvedValue({ _id: mockIngredientId }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchService,
        {
          provide: getModelToken(Batch.name),
          useValue: MockModel,
        },
        {
          provide: IngredientService,
          useValue: mockIngredientService,
        },
      ],
    }).compile();

    service = module.get<BatchService>(BatchService);
    ingredientService = module.get<IngredientService>(IngredientService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar una lista de lotes', async () => {
      mockExecFind.mockResolvedValue([mockBatch]);

      const result = await service.findAll();
      expect(MockModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockBatch]);
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
      await expect(service.findOne(mockBatchId)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.findOne('id-invalido')).rejects.toThrow(NotFoundException);
      expect(MockModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('debería validar que el ingrediente exista usando IngredientService', async () => {
      mockSave.mockResolvedValue({ _id: mockBatchId, ...mockCreateDto });

      const findOneSpy = vi.spyOn(ingredientService, 'findOne');
      await service.create(mockCreateDto);
      
      expect(findOneSpy).toHaveBeenCalledWith(mockIngredientId);
    });

    it('debería lanzar NotFoundException si el ingrediente no existe', async () => {
      vi.spyOn(ingredientService, 'findOne').mockRejectedValueOnce(new NotFoundException());
      
      await expect(service.create(mockCreateDto)).rejects.toThrow(NotFoundException);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería crear y guardar un lote', async () => {
      mockSave.mockResolvedValue({ _id: mockBatchId, ...mockCreateDto });

      const result = await service.create(mockCreateDto);

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        batchNumber: mockCreateDto.batchNumber,
        quantity: mockCreateDto.quantity,
        cost: mockCreateDto.cost,
      });
    });

    it('debería lanzar ConflictException si el numero de lote ya existe', async () => {
      const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      mockSave.mockRejectedValue(duplicateKeyError);

      await expect(service.create(mockCreateDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    const updateDto = { quantity: 50 };
    const updatedBatch = { ...mockBatch, ...updateDto };

    it('debería actualizar un lote', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue(updatedBatch);

      const result = await service.update(mockBatchId, updateDto);
      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(mockBatchId, updateDto, { new: true });
      expect(result).toEqual(updatedBatch);
    });

    it('debería lanzar NotFoundException si el lote no existe', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue(null);
      await expect(service.update(mockBatchId, updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('debería eliminar un lote', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 1 });
      await service.remove(mockBatchId);
      expect(MockModel.deleteOne).toHaveBeenCalledWith({ _id: mockBatchId });
    });

    it('debería lanzar NotFoundException si el lote no existe', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 0 });
      await expect(service.remove(mockBatchId)).rejects.toThrow(NotFoundException);
    });
  });
});
