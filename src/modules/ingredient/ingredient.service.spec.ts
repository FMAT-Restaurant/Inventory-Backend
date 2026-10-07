import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IngredientService } from './ingredient.service.js';
import { Ingredient } from './schemas/ingredient.schema.js';

describe('IngredientService', () => {
  let service: IngredientService;

  const mockExecFind = vi.fn();
  const mockExecFindById = vi.fn();
  const mockExecDeleteOne = vi.fn();
  const mockSave = vi.fn();

  function MockModel(this: any, dto: any) {
    Object.assign(this, dto);
    this.save = mockSave;
  }
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientService,
        {
          provide: getModelToken(Ingredient.name),
          useValue: MockModel,
        },
      ],
    }).compile();

    service = module.get<IngredientService>(IngredientService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar una lista de ingredientes', async () => {
      const mockIngredients = [
        { _id: '507f1f77bcf86cd799439011', name: 'Tomate', stock: 10, unit: 'kg', cost: 15 },
        { _id: '507f1f77bcf86cd799439012', name: 'Cebolla', stock: 5, unit: 'kg', cost: 10 },
      ];
      mockExecFind.mockResolvedValue(mockIngredients);

      const result = await service.findAll();
      expect(MockModel.find).toHaveBeenCalled();
      expect(result).toEqual(mockIngredients);
    });
  });

  describe('findOne', () => {
    it('debería retornar un ingrediente si existe', async () => {
      const mockIngredient = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Tomate',
        stock: 10,
        unit: 'kg',
        cost: 15,
      };
      mockExecFindById.mockResolvedValue(mockIngredient);

      const result = await service.findOne('507f1f77bcf86cd799439011');
      expect(MockModel.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockIngredient);
    });

    it('debería lanzar NotFoundException si no existe el ingrediente', async () => {
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

  describe('remove', () => {
    it('debería eliminar un ingrediente existente', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await expect(
        service.remove('507f1f77bcf86cd799439011'),
      ).resolves.toBeUndefined();
      expect(MockModel.deleteOne).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439011',
      });
    });

    it('debería lanzar NotFoundException si no existe el ingrediente', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 0 });

      await expect(
        service.remove('507f1f77bcf86cd799439011'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.remove('id-invalido')).rejects.toThrow(
        NotFoundException,
      );
      expect(MockModel.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('debería crear y guardar un ingrediente', async () => {
      const dto = { name: 'Ajo', unit: 'kg', stock: 2, cost: 30 };
      mockSave.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', ...dto });

      const result = await service.create(dto);

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        name: 'Ajo',
        unit: 'kg',
        stock: 2,
        cost: 30,
      });
    });

    it('debería lanzar ConflictException si el nombre ya existe', async () => {
      const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
      });
      mockSave.mockRejectedValue(duplicateKeyError);

      await expect(
        service.create({ name: 'Ajo', unit: 'kg', stock: 2, cost: 30 }),
      ).rejects.toThrow(ConflictException);
    });

    it('debería propagar otros errores de MongoDB sin convertir a ConflictException', async () => {
      const otherError = Object.assign(new Error('write concern'), { code: 91 });
      mockSave.mockRejectedValue(otherError);

      await expect(
        service.create({ name: 'Ajo', unit: 'kg', stock: 2, cost: 30 }),
      ).rejects.toThrow('write concern');
    });
  });
});
