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

  function MockModel(this: any, dto: any) {
    Object.assign(this, dto);
    this.save = mockSave;
  }
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.findByIdAndUpdate = vi.fn().mockReturnValue({ exec: mockExecFindByIdAndUpdate });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });

  const mockIngredientService = {
    findOne: vi.fn().mockResolvedValue({ _id: '60d5ec9af682fbd39a1b865b' }),
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
      const mockBatches = [
        { _id: '507f1f77bcf86cd799439011', batchNumber: 'LOTE-1', quantity: 10, cost: 15, expirationDate: new Date(), status: BatchStatus.ACTIVE },
      ];
      mockExecFind.mockResolvedValue(mockBatches);

      const result = await service.findAll();
      expect(MockModel.find).toHaveBeenCalled();
      expect(result).toEqual(mockBatches);
    });
  });

  describe('findOne', () => {
    it('debería retornar un lote si existe', async () => {
      const mockBatch = {
        _id: '507f1f77bcf86cd799439011',
        batchNumber: 'LOTE-1', quantity: 10, cost: 15, expirationDate: new Date(), status: BatchStatus.ACTIVE
      };
      mockExecFindById.mockResolvedValue(mockBatch);

      const result = await service.findOne('507f1f77bcf86cd799439011');
      expect(MockModel.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockBatch);
    });

    it('debería lanzar NotFoundException si no existe el lote', async () => {
      mockExecFindById.mockResolvedValue(null);

      await expect(service.findOne('507f1f77bcf86cd799439011')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.findOne('id-invalido')).rejects.toThrow(NotFoundException);
      expect(MockModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('debería validar que el ingrediente exista usando IngredientService', async () => {
      const dto = { batchNumber: 'LOTE-1', ingredientId: '60d5ec9af682fbd39a1b865b', quantity: 10, cost: 15, expirationDate: '2025-12-31' };
      mockSave.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', ...dto });

      const findOneSpy = vi.spyOn(ingredientService, 'findOne');
      await service.create(dto);
      
      expect(findOneSpy).toHaveBeenCalledWith(dto.ingredientId);
    });

    it('debería lanzar NotFoundException si el ingrediente no existe', async () => {
      const dto = { batchNumber: 'LOTE-1', ingredientId: '60d5ec9af682fbd39a1b865b', quantity: 10, cost: 15, expirationDate: '2025-12-31' };
      vi.spyOn(ingredientService, 'findOne').mockRejectedValueOnce(new NotFoundException());
      
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería crear y guardar un lote', async () => {
      const dto = { batchNumber: 'LOTE-1', ingredientId: '60d5ec9af682fbd39a1b865b', quantity: 10, cost: 15, expirationDate: '2025-12-31' };
      mockSave.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', ...dto });

      const result = await service.create(dto);

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        batchNumber: 'LOTE-1', quantity: 10, cost: 15
      });
    });

    it('debería lanzar ConflictException si el numero de lote ya existe', async () => {
      const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
      });
      mockSave.mockRejectedValue(duplicateKeyError);

      await expect(
        service.create({ batchNumber: 'LOTE-1', ingredientId: '60d5ec9af682fbd39a1b865b', quantity: 10, cost: 15, expirationDate: '2025-12-31' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('debería actualizar un lote', async () => {
      const mockBatch = { _id: '507f1f77bcf86cd799439011', quantity: 50 };
      mockExecFindByIdAndUpdate.mockResolvedValue(mockBatch);

      const result = await service.update('507f1f77bcf86cd799439011', { quantity: 50 });
      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith('507f1f77bcf86cd799439011', { quantity: 50 }, { new: true });
      expect(result).toEqual(mockBatch);
    });

    it('debería lanzar NotFoundException si el lote no existe', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue(null);
      await expect(service.update('507f1f77bcf86cd799439011', { quantity: 50 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('debería eliminar un lote', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 1 });
      await service.remove('507f1f77bcf86cd799439011');
      expect(MockModel.deleteOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011' });
    });

    it('debería lanzar NotFoundException si el lote no existe', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 0 });
      await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundException);
    });
  });
});
