import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RecipeService } from './recipe.service.js';
import { Recipe } from './schemas/recipe.schema.js';
import { ItemService } from '../item/item.service.js';
import {
  ITEM_CHANGED_EVENT,
  ItemChangeEmitter,
} from '../item/item-change.emitter.js';
import { EventPublisher } from '../../broker/event-publisher.service.js';

describe('RecipeService', () => {
  let service: RecipeService;
  let emitter: ItemChangeEmitter;

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

  function buildRecipe(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(mockRecipeId),
      plateId: 'PLATE-001',
      name: 'Hamburguesa',
      items: [
        {
          itemId: new Types.ObjectId(mockItemId1),
          requiredQuantity: 1,
        },
      ],
      lastKnownAvailability: true,
      save: mockSave,
      ...overrides,
    };
  }

  function getNotAvailableCalls() {
    return mockPublisher.publish.mock.calls.filter(
      ([, routingKey]) => routingKey === 'inventory.recipe.not-available',
    );
  }

  function getAvailabilityCalls() {
    return mockPublisher.publish.mock.calls.filter(
      ([, routingKey]) =>
        routingKey === 'inventory.recipe.availability-changed',
    );
  }

  async function flushAsync(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findOne = vi.fn().mockReturnValue({ exec: mockExecFindOne });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });

  const mockItemService = {
    findOne: vi.fn(),
    findAll: vi.fn(),
    registerRemovalGuard: vi.fn(),
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
    emitter = module.get<ItemChangeEmitter>(ItemChangeEmitter);
    await service.onModuleInit();
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

  describe('notificación de receta no disponible', () => {
    it('publica la disponibilidad en false cuando la receta deja de ser preparable (AC-01)', async () => {
      const recipe = buildRecipe();
      mockExecFind.mockResolvedValue([recipe]);
      mockItemService.findOne.mockResolvedValue({
        ...item1,
        availableStock: 0,
        totalStock: 0,
        stock: 0,
      });

      emitter.emit(ITEM_CHANGED_EVENT, {
        itemId: mockItemId1,
        action: 'updated',
      });

      await vi.waitFor(() => {
        expect(mockPublisher.publish).toHaveBeenCalledWith(
          'inventory.topic',
          'inventory.recipe.availability-changed',
          expect.objectContaining({
            plateId: 'PLATE-001',
            isAvailable: false,
          }),
        );
      });

      // El evento 'inventory.recipe.not-available' está desactivado
      expect(getNotAvailableCalls()).toHaveLength(0);
    });

    it('no publica si el item no pertenece a ninguna receta (AC-02)', async () => {
      mockExecFind.mockResolvedValue([]);

      emitter.emit(ITEM_CHANGED_EVENT, {
        itemId: mockItemId1,
        action: 'updated',
      });

      await flushAsync();

      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });

    it('publica la disponibilidad de cada receta afectada (AC-03)', async () => {
      const recipeA = buildRecipe({
        _id: new Types.ObjectId(),
        plateId: 'PLATE-A',
      });
      const recipeB = buildRecipe({
        _id: new Types.ObjectId(),
        plateId: 'PLATE-B',
      });
      mockExecFind.mockResolvedValue([recipeA, recipeB]);
      mockItemService.findOne.mockResolvedValue({
        ...item1,
        availableStock: 0,
        totalStock: 0,
        stock: 0,
      });

      emitter.emit(ITEM_CHANGED_EVENT, {
        itemId: mockItemId1,
        action: 'updated',
      });

      await vi.waitFor(() => {
        const calls = getAvailabilityCalls();
        expect(calls).toHaveLength(2);
        expect(calls.map(([, , payload]) => payload.plateId)).toEqual(
          expect.arrayContaining(['PLATE-A', 'PLATE-B']),
        );
      });
    });

    it('no publica si la receta sigue siendo preparable (AC-04)', async () => {
      const recipe = buildRecipe();
      mockExecFind.mockResolvedValue([recipe]);
      mockItemService.findOne.mockResolvedValue({
        ...item1,
        availableStock: 5,
        totalStock: 5,
        stock: 5,
      });

      emitter.emit(ITEM_CHANGED_EVENT, {
        itemId: mockItemId1,
        action: 'updated',
      });

      await flushAsync();

      expect(getNotAvailableCalls()).toHaveLength(0);
      expect(recipe.lastKnownAvailability).toBe(true);
    });

    it('no publica not-available aunque la receta siga sin stock (AC-05)', async () => {
      const recipe = buildRecipe();
      mockExecFind.mockResolvedValue([recipe]);
      mockItemService.findOne.mockResolvedValue({
        ...item1,
        availableStock: 0,
        totalStock: 0,
        stock: 0,
      });

      emitter.emit(ITEM_CHANGED_EVENT, {
        itemId: mockItemId1,
        action: 'updated',
      });
      await vi.waitFor(() => {
        expect(getAvailabilityCalls()).toHaveLength(1);
      });

      emitter.emit(ITEM_CHANGED_EVENT, {
        itemId: mockItemId1,
        action: 'updated',
      });
      await vi.waitFor(() => {
        expect(getAvailabilityCalls()).toHaveLength(2);
      });

      expect(getNotAvailableCalls()).toHaveLength(0);
    });

    it('registra el fallo de publicación sin fallar la operación (AC-06)', async () => {
      const recipe = buildRecipe();
      mockExecFind.mockResolvedValue([recipe]);
      mockItemService.findOne.mockResolvedValue({
        ...item1,
        availableStock: 0,
        totalStock: 0,
        stock: 0,
      });
      mockPublisher.publish.mockRejectedValue(new Error('Broker caído'));
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      expect(() =>
        emitter.emit(ITEM_CHANGED_EVENT, {
          itemId: mockItemId1,
          action: 'updated',
        }),
      ).not.toThrow();

      await flushAsync();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('inventory.recipe.availability-changed'),
      );
      expect(recipe.lastKnownAvailability).toBe(true);
      warnSpy.mockRestore();
    });
  });

  describe('insumos repetidos', () => {
    it('unifica en una sola línea las cantidades de un insumo repetido', async () => {
      mockExecFindOne.mockResolvedValue(null);

      const result = await service.registerOrUpdate({
        plateId: 'PLATE-DUP',
        name: 'Doble',
        items: [
          { itemId: mockItemId1, requiredQuantity: 0.1 },
          { itemId: mockItemId1, requiredQuantity: 0.2 },
        ],
      });

      expect(result.recipe.items).toHaveLength(1);
      expect(result.recipe.items[0].requiredQuantity).toBe(0.3);
    });

    it('evalúa la disponibilidad contra el total requerido en recetas antiguas con líneas repetidas', async () => {
      mockItemService.findOne.mockResolvedValue({
        _id: mockItemId1,
        name: 'Queso',
        unit: 'g',
        availableStock: 1000,
        averageCost: 1,
      });
      mockExecFindById.mockResolvedValue(
        buildRecipe({
          items: [
            { itemId: new Types.ObjectId(mockItemId1), requiredQuantity: 600 },
            { itemId: new Types.ObjectId(mockItemId1), requiredQuantity: 600 },
          ],
        }),
      );

      const recipe = await service.findOne(mockRecipeId);

      expect(recipe.isAvailable).toBe(false);
      expect(recipe.maxPreparablePortions).toBe(0);
      expect(recipe.items.every((i) => !i.hasSufficientStock)).toBe(true);
    });
  });

  describe('update', () => {
    it('rechaza una actualización sin campos', async () => {
      await expect(service.update('PLATE-001', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('regla de baja de items', () => {
    function registeredGuard(): (itemId: string) => Promise<string | null> {
      return mockItemService.registerRemovalGuard.mock.calls[0][0];
    }

    it('impide la baja de un item usado por recetas', async () => {
      mockExecFind.mockResolvedValue([buildRecipe()]);

      await expect(registeredGuard()(mockItemId1)).resolves.toContain(
        "lo usan 1 receta(s) ('Hamburguesa')",
      );
    });

    it('permite la baja si ninguna receta usa el item', async () => {
      mockExecFind.mockResolvedValue([]);

      await expect(registeredGuard()(mockItemId1)).resolves.toBeNull();
    });
  });
});
