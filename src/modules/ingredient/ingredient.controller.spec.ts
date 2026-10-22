import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { IngredientsController } from './ingredient.controller.js';
import { IngredientService } from './ingredient.service.js';

describe('IngredientsController', () => {
  let controller: IngredientsController;
  let service: IngredientService;

  const mockIngredient = {
    _id: '507f1f77bcf86cd799439011',
    sku: 'ING-0001',
    name: 'Tomate',
    category: 'Verduras',
    unit: 'kg',
    minStock: 10,
    storageCondition: 'Refrigerado',
  };

  const mockIngredientService = {
    create: vi.fn().mockResolvedValue(mockIngredient),
    findAll: vi.fn().mockResolvedValue([mockIngredient]),
    findOne: vi.fn().mockResolvedValue(mockIngredient),
    update: vi.fn().mockResolvedValue(mockIngredient),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngredientsController],
      providers: [
        {
          provide: IngredientService,
          useValue: mockIngredientService,
        },
      ],
    }).compile();

    controller = module.get<IngredientsController>(IngredientsController);
    service = module.get<IngredientService>(IngredientService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar un array de ingredientes', async () => {
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockIngredient]);
    });
  });

  describe('findOne', () => {
    it('debería retornar un ingrediente por su id', async () => {
      const result = await controller.findOne('507f1f77bcf86cd799439011');
      expect(service.findOne).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockIngredient);
    });
  });

  describe('create', () => {
    it('debería crear un nuevo ingrediente', async () => {
      const dto = {
        sku: 'ING-0001',
        name: 'Tomate',
        category: 'Verduras',
        unit: 'kg',
        minStock: 10,
        storageCondition: 'Refrigerado',
      };
      const result = await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockIngredient);
    });
  });

  describe('update', () => {
    it('debería actualizar un ingrediente', async () => {
      const dto = { name: 'Tomate perita' };
      const result = await controller.update('507f1f77bcf86cd799439011', dto);
      expect(service.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', dto);
      expect(result).toEqual(mockIngredient);
    });
  });

  describe('remove', () => {
    it('debería desactivar un ingrediente', async () => {
      const result = await controller.remove('507f1f77bcf86cd799439011');
      expect(service.remove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toBeUndefined();
    });
  });
});
