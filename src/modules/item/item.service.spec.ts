import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ItemService } from './item.service.js';
import { Item } from './schemas/item.schema.js';
import {
  ITEM_CHANGED_EVENT,
  ItemChangeEmitter,
  ItemChangedEvent,
} from './item-change.emitter.js';

const ACTIVE_FILTER = { isActive: { $ne: false } };
const VALID_ID = '507f1f77bcf86cd799439011';

describe('ItemService', () => {
  let service: ItemService;
  let emitter: ItemChangeEmitter;
  let emittedEvents: ItemChangedEvent[];

  const mockExecFind = vi.fn();
  const mockExecFindOne = vi.fn();
  const mockExecFindByIdAndUpdate = vi.fn();
  const mockExecFindOneAndUpdate = vi.fn();
  const mockSave = vi.fn();

  function MockModel(this: any, dto: any) {
    Object.assign(this, dto);
    this.save = mockSave;
  }
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findOne = vi.fn().mockReturnValue({ exec: mockExecFindOne });
  MockModel.findByIdAndUpdate = vi
    .fn()
    .mockReturnValue({ exec: mockExecFindByIdAndUpdate });
  MockModel.findOneAndUpdate = vi
    .fn()
    .mockReturnValue({ exec: mockExecFindOneAndUpdate });

  const createDto = {
    sku: 'ING-0001',
    name: 'Tomate',
    category: 'Verduras',
    unit: 'kg',
    minStock: 10,
    storageCondition: 'Refrigerado',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ _id: VALID_ID, ...createDto });
    emittedEvents = [];

    emitter = new ItemChangeEmitter();
    emitter.on(ITEM_CHANGED_EVENT, (event: ItemChangedEvent) => {
      emittedEvents.push(event);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemService,
        {
          provide: getModelToken(Item.name),
          useValue: MockModel,
        },
        {
          provide: ItemChangeEmitter,
          useValue: emitter,
        },
      ],
    }).compile();

    service = module.get<ItemService>(ItemService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar una lista de items', async () => {
      const mockItems = [
        { _id: VALID_ID, name: 'Tomate', totalStock: 10, unit: 'kg' },
        { _id: '507f1f77bcf86cd799439012', name: 'Cebolla', totalStock: 5 },
      ];
      mockExecFind.mockResolvedValue(mockItems);

      const result = await service.findAll();

      expect(result).toEqual(mockItems);
    });

    it('debería filtrar solo los items activos', async () => {
      mockExecFind.mockResolvedValue([]);

      await service.findAll();

      expect(MockModel.find).toHaveBeenCalledWith(ACTIVE_FILTER);
    });

    it('debería buscar por nombre sin distinguir mayúsculas', async () => {
      mockExecFind.mockResolvedValue([]);

      await service.findAll({ q: 'TOMATE' });

      expect(MockModel.find).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        name: { $regex: 'TOMATE', $options: 'i' },
      });
    });

    it('debería usar una coincidencia parcial del nombre', async () => {
      const matches = [{ _id: VALID_ID, name: 'Tomate perita' }];
      mockExecFind.mockResolvedValue(matches);

      const result = await service.findAll({ q: 'tom' });

      expect(MockModel.find).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        name: { $regex: 'tom', $options: 'i' },
      });
      expect(result).toEqual(matches);
    });

    it('debería recortar los espacios alrededor del término de búsqueda', async () => {
      mockExecFind.mockResolvedValue([]);

      await service.findAll({ q: '  tomate  ' });

      expect(MockModel.find).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        name: { $regex: 'tomate', $options: 'i' },
      });
    });

    it('debería escapar los caracteres especiales de regex', async () => {
      mockExecFind.mockResolvedValue([]);

      await service.findAll({ q: 'tom.ate (perita)' });

      expect(MockModel.find).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        name: { $regex: 'tom\\.ate \\(perita\\)', $options: 'i' },
      });
    });

    it('debería ignorar un término vacío o compuesto solo de espacios', async () => {
      mockExecFind.mockResolvedValue([]);

      await service.findAll({ q: '   ' });

      expect(MockModel.find).toHaveBeenCalledWith(ACTIVE_FILTER);
    });
  });

  describe('findOne', () => {
    it('debería retornar un item si existe', async () => {
      const mockItem = { _id: VALID_ID, name: 'Tomate', unit: 'kg' };
      mockExecFindOne.mockResolvedValue(mockItem);

      const result = await service.findOne(VALID_ID);

      expect(MockModel.findOne).toHaveBeenCalledWith({
        _id: VALID_ID,
        ...ACTIVE_FILTER,
      });
      expect(result).toEqual(mockItem);
    });

    it('debería lanzar NotFoundException si no existe el item', async () => {
      mockExecFindOne.mockResolvedValue(null);

      await expect(service.findOne(VALID_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar NotFoundException si el item está inactivo', async () => {
      mockExecFindOne.mockResolvedValue(null);

      await expect(service.findOne(VALID_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.findOne('id-invalido')).rejects.toThrow(
        NotFoundException,
      );
      expect(MockModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('debería actualizar y devolver el item', async () => {
      const updated = { _id: VALID_ID, name: 'Tomate perita' };
      mockExecFindOneAndUpdate.mockResolvedValue(updated);

      const result = await service.update(VALID_ID, { name: 'Tomate perita' });

      expect(MockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: VALID_ID, ...ACTIVE_FILTER },
        { name: 'Tomate perita' },
        { new: true, runValidators: true },
      );
      expect(result).toEqual(updated);
    });

    it('debería emitir el evento de actualización', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await service.update(VALID_ID, { category: 'Frutas' });

      expect(emittedEvents).toEqual([{ itemId: VALID_ID, action: 'updated' }]);
    });

    it('debería lanzar BadRequestException si no hay campos que actualizar', async () => {
      await expect(service.update(VALID_ID, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(
        service.update('id-invalido', { name: 'Tomate' }),
      ).rejects.toThrow(NotFoundException);
      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el item no existe', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.update(VALID_ID, { name: 'Tomate' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si el item está inactivo', async () => {
      // El filtro de items activos no encuentra coincidencias.
      mockExecFindOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.update(VALID_ID, { name: 'Tomate' }),
      ).rejects.toThrow(NotFoundException);
      expect(emittedEvents).toEqual([]);
    });

    it('debería lanzar ConflictException si el nombre ya existe', async () => {
      const duplicateKeyError = Object.assign(
        new Error('E11000 duplicate key'),
        {
          code: 11000,
        },
      );
      mockExecFindOneAndUpdate.mockRejectedValue(duplicateKeyError);

      await expect(
        service.update(VALID_ID, { name: 'Cebolla' }),
      ).rejects.toThrow(ConflictException);
    });

    it('debería propagar otros errores sin convertirlos en ConflictException', async () => {
      const otherError = Object.assign(new Error('write concern'), {
        code: 91,
      });
      mockExecFindOneAndUpdate.mockRejectedValue(otherError);

      await expect(
        service.update(VALID_ID, { name: 'Cebolla' }),
      ).rejects.toThrow('write concern');
    });
  });

  describe('updateStockAndCost', () => {
    it('debería actualizar totalStock y averageCost del item', async () => {
      const updatedDoc = { _id: VALID_ID, totalStock: 25, averageCost: 18 };
      mockExecFindByIdAndUpdate.mockResolvedValue(updatedDoc);

      const result = await service.updateStockAndCost(VALID_ID, 25, 18);

      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        VALID_ID,
        { totalStock: 25, averageCost: 18 },
        { new: true },
      );
      expect(result).toEqual(updatedDoc);
    });

    it('debería emitir el evento de actualización', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await service.updateStockAndCost(VALID_ID, 25, 18);

      expect(emittedEvents).toEqual([{ itemId: VALID_ID, action: 'updated' }]);
    });

    it('debería limitar a cero un totalStock negativo', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await service.updateStockAndCost(VALID_ID, -10);

      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        VALID_ID,
        { totalStock: 0 },
        { new: true },
      );
    });

    it('debería limitar a cero un averageCost negativo', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await service.updateStockAndCost(VALID_ID, 10, -5);

      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        VALID_ID,
        { totalStock: 10, averageCost: 0 },
        { new: true },
      );
    });

    it('debería lanzar NotFoundException si el ID es inválido o no existe', async () => {
      await expect(service.updateStockAndCost('invalido', 10)).rejects.toThrow(
        NotFoundException,
      );
      mockExecFindByIdAndUpdate.mockResolvedValue(null);
      await expect(service.updateStockAndCost(VALID_ID, 10)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('debería desactivar el item en vez de borrarlo', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue({
        _id: VALID_ID,
        isActive: false,
      });

      await expect(service.remove(VALID_ID)).resolves.toBeUndefined();

      expect(MockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: VALID_ID, ...ACTIVE_FILTER },
        { isActive: false },
        { new: true },
      );
    });

    it('debería emitir el evento de eliminación', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await service.remove(VALID_ID);

      expect(emittedEvents).toEqual([{ itemId: VALID_ID, action: 'removed' }]);
    });

    it('debería lanzar NotFoundException si el item ya está inactivo', async () => {
      // El filtro de items activos no encuentra coincidencias.
      mockExecFindOneAndUpdate.mockResolvedValue(null);

      await expect(service.remove(VALID_ID)).rejects.toThrow(NotFoundException);
      expect(emittedEvents).toEqual([]);
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.remove('id-invalido')).rejects.toThrow(
        NotFoundException,
      );
      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('debería crear y guardar un item', async () => {
      const result = await service.create(createDto);

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        sku: 'ING-0001',
        name: 'Tomate',
        category: 'Verduras',
        unit: 'kg',
        minStock: 10,
        storageCondition: 'Refrigerado',
      });
    });

    it('debería emitir el evento de creación', async () => {
      await service.create(createDto);

      expect(emittedEvents).toEqual([{ itemId: VALID_ID, action: 'created' }]);
    });

    it('debería lanzar ConflictException si el nombre ya existe', async () => {
      const duplicateKeyError = Object.assign(
        new Error('E11000 duplicate key'),
        {
          code: 11000,
        },
      );
      mockSave.mockRejectedValue(duplicateKeyError);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('debería propagar otros errores de MongoDB sin convertir a ConflictException', async () => {
      const otherError = Object.assign(new Error('write concern'), {
        code: 91,
      });
      mockSave.mockRejectedValue(otherError);

      await expect(service.create(createDto)).rejects.toThrow('write concern');
    });
  });
});
