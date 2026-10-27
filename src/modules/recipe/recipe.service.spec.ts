import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RecipeService } from './recipe.service.js';
import { Recipe } from './schemas/recipe.schema.js';
import { ItemService } from '../item/item.service.js';
import { ItemChangeEmitter } from '../item/item-change.emitter.js';
import { EventPublisher } from '../../broker/event-publisher.service.js';

describe('RecipeService', () => {
  let service: RecipeService;

  const mockExecFind = vi.fn();
  const mockExecFindOne = vi.fn();
  const mockExecFindById = vi.fn();
  const mockExecDeleteOne = vi.fn();
  const mockSave = vi.fn();

  const mockRecipeId = '507f1f77bcf86cd799439011';
  const mockItemId1 = '60d5ec9af682fbd39a1b865b';
  const mockItemId2 = '60d5ec9af682fbd39a1b865c';

  const mockCreateDto = {
    plateId: 'PLATE-001',
    name: 'Hamburguesa',
    items: [
      { itemId: mockItemId1, requiredQuantity: 0.2 },
      { itemId: mockItemId2, requiredQuantity: 1 },
    ],
  };

  const item1 = {
    _id: new Types.ObjectId(mockItemId1),
    name: 'Carne',
    unit: 'kg',
    availableStock: 2,
    totalStock: 2,
    stock: 2, // 2 / 0.2 = 10 porciones
    averageCost: 50,
    cost: 50,
  };

  const item2 = {
    _id: new Types.ObjectId(mockItemId2),
    name: 'Pan',
    unit: 'pza',
    availableStock: 5,
    totalStock: 5,
    stock: 5, // 5 / 1 = 5 porciones
    averageCost: 5,
    cost: 5,
  };

  function MockModel(this: any, dto: any) {
    Object.assign(this, dto);
    this._id = new Types.ObjectId(mockRecipeId);
    this.save = mockSave;
  }
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findOne = vi.fn().mockReturnValue({ exec: mockExecFindOne });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });

  const mockItemService = {
    findOne: vi.fn(),
    findAll: vi.fn(),
  };

  const mockPublisher = {
    publish: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({});

    mockItemService.findOne.mockImplementation((id: string) => {
      if (id === mockItemId1) return Promise.resolve(item1);
      if (id === mockItemId2) return Promise.resolve(item2);
      return Promise.reject(new NotFoundException());
    });
    mockItemService.findAll.mockResolvedValue([item1, item2]);
    mockPublisher.publish.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipeService,
        {
          provide: getModelToken(Recipe.name),
          useValue: MockModel,
        },
        {
          provide: ItemService,
          useValue: mockItemService,
        },
        {
          provide: ItemChangeEmitter,
          useValue: new ItemChangeEmitter(),
        },
        {
          provide: EventPublisher,
          useValue: mockPublisher,
        },
      ],
    }).compile();

    service = module.get<RecipeService>(RecipeService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('registerOrUpdate', () => {
    it('debería registrar una nueva receta si no existe (isNew: true)', async () => {
      mockExecFindOne.mockResolvedValue(null);

      const result = await service.registerOrUpdate(mockCreateDto);

      expect(MockModel.findOne).toHaveBeenCalledWith({ plateId: 'PLATE-001' });
      expect(result.isNew).toBe(true);
      expect(result.recipe.plateId).toBe('PLATE-001');
      expect(result.recipe.isAvailable).toBe(true);
      expect(result.recipe.maxPreparablePortions).toBe(5); // Botleneck: Pan tiene 5 porciones
      expect(result.recipe.productionCost).toBe(15); // (0.2 * 50) + (1 * 5) = 10 + 5 = 15
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'inventory.topic',
        'inventory.recipe.availability-changed',
        expect.objectContaining({
          plateId: 'PLATE-001',
          isAvailable: true,
          maxPreparablePortions: 5,
          productionCost: 15,
        }),
      );
    });

    it('debería actualizar la receta existente si ya existe el plateId (idempotencia, isNew: false)', async () => {
      const existingRecipe = {
        _id: new Types.ObjectId(mockRecipeId),
        plateId: 'PLATE-001',
        name: 'Hamburguesa Antigua',
        items: [],
        save: mockSave,
      };
      mockExecFindOne.mockResolvedValue(existingRecipe);

      const result = await service.registerOrUpdate(mockCreateDto);

      expect(result.isNew).toBe(false);
      expect(existingRecipe.name).toBe('Hamburguesa');
      expect(mockSave).toHaveBeenCalled();
      expect(result.recipe.name).toBe('Hamburguesa');
    });

    it('debería lanzar NotFoundException si algún item no existe', async () => {
      mockItemService.findOne.mockRejectedValueOnce(new NotFoundException());

      await expect(
        service.registerOrUpdate({
          ...mockCreateDto,
          items: [{ itemId: 'nonexistentId', requiredQuantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debería manejar cuello de botella y marcar isAvailable en false si un item tiene stock 0', async () => {
      mockExecFindOne.mockResolvedValue(null);
      mockItemService.findOne.mockImplementation((id: string) => {
        if (id === mockItemId1) return Promise.resolve(item1);
        if (id === mockItemId2)
          return Promise.resolve({
            ...item2,
            stock: 0,
            availableStock: 0,
            totalStock: 0,
          });
        return Promise.reject(new NotFoundException());
      });

      const result = await service.registerOrUpdate(mockCreateDto);

      expect(result.recipe.isAvailable).toBe(false);
      expect(result.recipe.maxPreparablePortions).toBe(0);
      expect(result.recipe.items[1].hasSufficientStock).toBe(false);
    });
  });

  describe('findAll', () => {
    it('debería retornar recetas con cálculo de disponibilidad', async () => {
      const mockDoc = {
        _id: new Types.ObjectId(mockRecipeId),
        plateId: 'PLATE-001',
        name: 'Hamburguesa',
        items: [
          {
            itemId: new Types.ObjectId(mockItemId1),
            requiredQuantity: 0.2,
          },
        ],
      };
      mockExecFind.mockResolvedValue([mockDoc]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].isAvailable).toBe(true);
      expect(result[0].maxPreparablePortions).toBe(10);
    });

    it('debería filtrar recetas por disponibilidad cuando available=true', async () => {
      const availableDoc = {
        _id: new Types.ObjectId(mockRecipeId),
        plateId: 'PLATE-001',
        name: 'Hamburguesa',
        items: [
          {
            itemId: new Types.ObjectId(mockItemId1),
            requiredQuantity: 0.2,
          },
        ],
      };
      const unavailableDoc = {
        _id: new Types.ObjectId(),
        plateId: 'PLATE-002',
        name: 'Ensalada',
        items: [
          {
            itemId: new Types.ObjectId(mockItemId1),
            requiredQuantity: 500, // Requiere más del stock disponible (2)
          },
        ],
      };
      mockExecFind.mockResolvedValue([availableDoc, unavailableDoc]);

      const result = await service.findAll({ available: true });

      expect(result).toHaveLength(1);
      expect(result[0].plateId).toBe('PLATE-001');
    });
  });

  describe('findOne', () => {
    it('debería encontrar una receta por ID de MongoDB', async () => {
      const mockDoc = {
        _id: new Types.ObjectId(mockRecipeId),
        plateId: 'PLATE-001',
        name: 'Hamburguesa',
        items: [
          {
            itemId: new Types.ObjectId(mockItemId1),
            requiredQuantity: 0.2,
          },
        ],
      };
      mockExecFindById.mockResolvedValue(mockDoc);

      const result = await service.findOne(mockRecipeId);

      expect(result.id).toBe(mockRecipeId);
      expect(result.plateId).toBe('PLATE-001');
    });

    it('debería encontrar una receta por plateId', async () => {
      const mockDoc = {
        _id: new Types.ObjectId(mockRecipeId),
        plateId: 'PLATE-001',
        name: 'Hamburguesa',
        items: [],
      };
      mockExecFindOne.mockResolvedValue(mockDoc);

      const result = await service.findOne('PLATE-001');

      expect(result.plateId).toBe('PLATE-001');
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      mockExecFindById.mockResolvedValue(null);
      mockExecFindOne.mockResolvedValue(null);

      await expect(service.findOne('NON-EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('debería eliminar una receta existente y publicar disponibilidad false', async () => {
      const existingRecipe = {
        _id: new Types.ObjectId(mockRecipeId),
        plateId: 'PLATE-001',
        name: 'Hamburguesa',
        items: [],
      };
      mockExecFindById.mockResolvedValue(existingRecipe);
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await expect(service.remove(mockRecipeId)).resolves.not.toThrow();
      expect(MockModel.deleteOne).toHaveBeenCalledWith({
        _id: existingRecipe._id,
      });
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'inventory.topic',
        'inventory.recipe.availability-changed',
        expect.objectContaining({
          plateId: 'PLATE-001',
          isAvailable: false,
          maxPreparablePortions: 0,
          productionCost: 0,
        }),
      );
    });

    it('debería lanzar NotFoundException si no existe la receta a eliminar', async () => {
      mockExecFindById.mockResolvedValue(null);
      mockExecFindOne.mockResolvedValue(null);

      await expect(service.remove('NON-EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
      expect(MockModel.deleteOne).not.toHaveBeenCalled();
    });
  });
});
