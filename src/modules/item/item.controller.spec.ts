import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ItemsController } from './item.controller.js';
import { ItemService } from './item.service.js';

describe('ItemsController', () => {
  let controller: ItemsController;
  let service: ItemService;

  const mockItem = {
    _id: '507f1f77bcf86cd799439011',
    sku: 'ING-0001',
    name: 'Tomate',
    category: 'Verduras',
    unit: 'kg',
    minStock: 10,
    storageCondition: 'Refrigerado',
  };

  const mockItemService = {
    create: vi.fn().mockResolvedValue(mockItem),
    findAll: vi.fn().mockResolvedValue([mockItem]),
    findOne: vi.fn().mockResolvedValue(mockItem),
    update: vi.fn().mockResolvedValue(mockItem),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [
        {
          provide: ItemService,
          useValue: mockItemService,
        },
      ],
    }).compile();

    controller = module.get<ItemsController>(ItemsController);
    service = module.get<ItemService>(ItemService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar un array de items', async () => {
      const result = await controller.findAll({});
      expect(service.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual([mockItem]);
    });

    it('debería reenviar el término de búsqueda al servicio', async () => {
      const query = { q: 'tomate' };

      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual([mockItem]);
    });
  });

  describe('findOne', () => {
    it('debería retornar un item por su id', async () => {
      const result = await controller.findOne('507f1f77bcf86cd799439011');
      expect(service.findOne).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockItem);
    });
  });

  describe('create', () => {
    it('debería crear un nuevo item', async () => {
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
      expect(result).toEqual(mockItem);
    });
  });

  describe('update', () => {
    it('debería actualizar un item', async () => {
      const dto = { name: 'Tomate perita' };
      const result = await controller.update('507f1f77bcf86cd799439011', dto);
      expect(service.update).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        dto,
      );
      expect(result).toEqual(mockItem);
    });
  });

  describe('remove', () => {
    it('debería desactivar un item', async () => {
      const result = await controller.remove('507f1f77bcf86cd799439011');
      expect(service.remove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toBeUndefined();
    });
  });
});
