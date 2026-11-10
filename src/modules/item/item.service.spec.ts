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
import { SupplierService } from '../suppliers/supplier.service.js';
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
  const mockExecExists = vi.fn();
  const mockSave = vi.fn();
  const mockSupplierService = { assertAssignable: vi.fn() };

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
  MockModel.exists = vi.fn().mockReturnValue({ exec: mockExecExists });

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
    mockSupplierService.assertAssignable.mockResolvedValue(undefined);
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
        {
          provide: SupplierService,
          useValue: mockSupplierService,
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

  describe('reserveStock', () => {
    it('reserva stock solo si hay disponibilidad y emite el cambio', async () => {
      const updated = { _id: VALID_ID, totalStock: 10, reservedStock: 5 };
      mockExecFindOneAndUpdate.mockResolvedValue(updated);

      const result = await service.reserveStock(VALID_ID, 3);

      expect(MockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: VALID_ID,
          ...ACTIVE_FILTER,
          $expr: expect.any(Object),
        }),
        { $inc: { reservedStock: 3 } },
        { new: true },
      );
      expect(result).toEqual(updated);
      expect(emittedEvents).toEqual([{ itemId: VALID_ID, action: 'updated' }]);
    });

    it('devuelve null sin emitir evento si no hay stock suficiente', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue(null);

      await expect(service.reserveStock(VALID_ID, 20)).resolves.toBeNull();
      expect(emittedEvents).toEqual([]);
    });

    it('rechaza cantidades inválidas y IDs inválidos', async () => {
      await expect(service.reserveStock(VALID_ID, 0)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reserveStock('invalido', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('adjustReservedStock', () => {
    it('incrementa el stock reservado cuando el delta es positivo', async () => {
      const updated = { _id: VALID_ID, reservedStock: 8 };
      mockExecFindByIdAndUpdate.mockResolvedValue(updated);

      const result = await service.adjustReservedStock(VALID_ID, 2);

      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        VALID_ID,
        { $inc: { reservedStock: 2 } },
        { new: true },
      );
      expect(result).toEqual(updated);
      expect(emittedEvents).toEqual([{ itemId: VALID_ID, action: 'updated' }]);
    });

    it('decrementa solo si hay stock reservado suficiente', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue({
        _id: VALID_ID,
        reservedStock: 4,
      });

      await service.adjustReservedStock(VALID_ID, -3);

      expect(MockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: VALID_ID, $expr: expect.any(Object) }),
        { $inc: { reservedStock: -3 } },
        { new: true },
      );
    });

    it('lanza ConflictException si no hay stock reservado suficiente', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue(null);
      mockExecExists.mockResolvedValue({ _id: VALID_ID });

      await expect(service.adjustReservedStock(VALID_ID, -3)).rejects.toThrow(
        ConflictException,
      );
    });

    it('lanza NotFoundException si el item no existe', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue(null);
      mockExecExists.mockResolvedValue(null);

      await expect(service.adjustReservedStock(VALID_ID, -3)).rejects.toThrow(
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

  describe('unicidad de SKU y nombre', () => {
    it('rechaza un SKU repetido indicando el campo correcto', async () => {
      mockExecFindOne.mockResolvedValueOnce({ _id: 'otro', sku: 'ing-0001' });

      await expect(service.create(createDto)).rejects.toThrow(
        "Ya existe un item con el SKU 'ING-0001'",
      );
      expect(MockModel.findOne).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        sku: { $regex: '^ING-0001$', $options: 'i' },
      });
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('rechaza un nombre que solo difiere en mayúsculas', async () => {
      mockExecFindOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: 'otro', name: 'tomate' });

      await expect(service.create(createDto)).rejects.toThrow(
        "Ya existe un item con el nombre 'Tomate'",
      );
    });

    it('solo compara contra items activos, así un item dado de baja libera su SKU', async () => {
      mockExecFindOne.mockResolvedValue(null);

      await service.create(createDto);

      for (const [filter] of MockModel.findOne.mock.calls) {
        expect(filter).toMatchObject(ACTIVE_FILTER);
      }
    });

    it('al actualizar excluye al propio item de la comparación', async () => {
      mockExecFindOne.mockResolvedValue(null);
      mockExecFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await service.update(VALID_ID, { sku: 'ING-0002' });

      expect(MockModel.findOne).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        sku: { $regex: '^ING-0002$', $options: 'i' },
        _id: { $ne: VALID_ID },
      });
    });

    it('usa el índice violado para nombrar el campo si la base rechaza el duplicado', async () => {
      mockExecFindOne.mockResolvedValue(null);
      mockSave.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key'), {
          code: 11000,
          keyPattern: { sku: 1 },
        }),
      );

      await expect(service.create(createDto)).rejects.toThrow(
        "Ya existe un item con el SKU 'ING-0001'",
      );
    });
  });

  describe('reglas de baja', () => {
    it('impide dar de baja un item en uso', async () => {
      service.registerRemovalGuard(async () => null);
      service.registerRemovalGuard(async () => 'Lo usan 2 receta(s)');

      await expect(service.remove(VALID_ID)).rejects.toThrow(
        new ConflictException('Lo usan 2 receta(s)'),
      );
      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(emittedEvents).toEqual([]);
    });

    it('permite la baja cuando nada usa el item', async () => {
      const guard = vi.fn().mockResolvedValue(null);
      service.registerRemovalGuard(guard);
      mockExecFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await expect(service.remove(VALID_ID)).resolves.toBeUndefined();
      expect(guard).toHaveBeenCalledWith(VALID_ID);
    });
  });

  describe('onModuleInit', () => {
    it('elimina los índices únicos legados y normaliza isActive', async () => {
      const dropIndex = vi.fn().mockResolvedValue(undefined);
      const updateManyExec = vi.fn().mockResolvedValue({});
      const model = MockModel as unknown as Record<string, unknown>;
      model.collection = { dropIndex };
      model.updateMany = vi.fn().mockReturnValue({ exec: updateManyExec });

      await service.onModuleInit();

      expect(dropIndex).toHaveBeenCalledWith('sku_1');
      expect(dropIndex).toHaveBeenCalledWith('name_1');
      expect(model.updateMany).toHaveBeenCalledWith(
        { isActive: { $exists: false } },
        { $set: { isActive: true } },
      );
    });

    it('no falla si los índices no existen ni si la normalización falla', async () => {
      const model = MockModel as unknown as Record<string, unknown>;
      model.collection = {
        dropIndex: vi.fn().mockRejectedValue(new Error('index not found')),
      };
      model.updateMany = vi.fn().mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('mongo caído')),
      });

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('proveedor sugerido', () => {
    const SUPPLIER_ID = '60d5ec9af682fbd39a1b865b';
    const OTHER_SUPPLIER_ID = '60d5ec9af682fbd39a1b865c';

    it('al crear exige que el proveedor exista y esté activo', async () => {
      mockExecFindOne.mockResolvedValue(null);
      mockSupplierService.assertAssignable.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(
        service.create({ ...createDto, supplierIdSugested: SUPPLIER_ID }),
      ).rejects.toThrow(NotFoundException);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('al actualizar conserva el proveedor actual aunque esté dado de baja', async () => {
      mockExecFindOne.mockResolvedValue({
        _id: VALID_ID,
        supplierIdSugested: SUPPLIER_ID,
      });
      mockExecFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID });

      await service.update(VALID_ID, { supplierIdSugested: SUPPLIER_ID });

      expect(mockSupplierService.assertAssignable).not.toHaveBeenCalled();
    });

    it('al actualizar valida el proveedor cuando se cambia por otro', async () => {
      mockExecFindOne.mockResolvedValue({
        _id: VALID_ID,
        supplierIdSugested: SUPPLIER_ID,
      });
      mockSupplierService.assertAssignable.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(
        service.update(VALID_ID, { supplierIdSugested: OTHER_SUPPLIER_ID }),
      ).rejects.toThrow(NotFoundException);
      expect(mockSupplierService.assertAssignable).toHaveBeenCalledWith(
        OTHER_SUPPLIER_ID,
      );
      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
