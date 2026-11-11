import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SupplierService } from './supplier.service.js';
import { Supplier } from './schemas/supplier.schema.js';

const ACTIVE_FILTER = { isActive: { $ne: false } };

describe('SupplierService', () => {
  let service: SupplierService;

  const mockExecFind = vi.fn();
  const mockExecFindOne = vi.fn();
  const mockExecFindById = vi.fn();
  const mockExecFindOneAndUpdate = vi.fn();
  const mockSave = vi.fn();

  const mockSupplierId = '507f1f77bcf86cd799439011';

  const mockCreateDto = {
    name: 'Distribuidora Central',
    contactName: 'Juan Pérez',
    phone: '+52 55 1234 5678',
    email: 'contacto@proveedor.com',
    address: 'Av. Reforma 123, CDMX',
  };

  const mockSupplier = {
    _id: mockSupplierId,
    ...mockCreateDto,
  };

  function MockModel(this: any, dto: any) {
    Object.assign(this, dto);
    this.save = mockSave;
  }
  MockModel.find = vi.fn().mockReturnValue({ exec: mockExecFind });
  MockModel.findOne = vi.fn().mockReturnValue({ exec: mockExecFindOne });
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.findOneAndUpdate = vi
    .fn()
    .mockReturnValue({ exec: mockExecFindOneAndUpdate });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({});
    mockExecFindOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierService,
        {
          provide: getModelToken(Supplier.name),
          useValue: MockModel,
        },
      ],
    }).compile();

    service = module.get<SupplierService>(SupplierService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar una lista de proveedores', async () => {
      mockExecFind.mockResolvedValue([mockSupplier]);

      const result = await service.findAll();
      expect(MockModel.find).toHaveBeenCalledWith(ACTIVE_FILTER);
      expect(result).toEqual([mockSupplier]);
    });

    it('debería incluir los dados de baja cuando se pide includeInactive', async () => {
      mockExecFind.mockResolvedValue([mockSupplier]);

      await service.findAll({ includeInactive: true });
      expect(MockModel.find).toHaveBeenCalledWith({});
    });
  });

  describe('findOne', () => {
    it('debería retornar un proveedor si existe', async () => {
      mockExecFindById.mockResolvedValue(mockSupplier);

      const result = await service.findOne(mockSupplierId);
      expect(MockModel.findById).toHaveBeenCalledWith(mockSupplierId);
      expect(result).toEqual(mockSupplier);
    });

    it('debería lanzar NotFoundException si no existe el proveedor', async () => {
      mockExecFindById.mockResolvedValue(null);
      await expect(service.findOne(mockSupplierId)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.findOne('id-invalido')).rejects.toThrow(NotFoundException);
      expect(MockModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('debería crear y guardar un proveedor', async () => {
      mockSave.mockResolvedValue({ _id: mockSupplierId, ...mockCreateDto });

      const result = await service.create(mockCreateDto);

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        name: mockCreateDto.name,
        email: mockCreateDto.email,
      });
    });

    it('debería lanzar ConflictException si el nombre ya existe', async () => {
      const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
      });
      mockSave.mockRejectedValue(duplicateKeyError);

      await expect(service.create(mockCreateDto)).rejects.toThrow(ConflictException);
    });

    it('debería rechazar un nombre que solo difiere en mayúsculas', async () => {
      mockExecFindOne.mockResolvedValue(mockSupplier);

      await expect(
        service.create({ name: 'DISTRIBUIDORA CENTRAL' }),
      ).rejects.toThrow(ConflictException);
      expect(MockModel.findOne).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        name: { $regex: '^DISTRIBUIDORA CENTRAL$', $options: 'i' },
      });
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateDto = { phone: '+52 55 0000 0000' };
    const updatedSupplier = { ...mockSupplier, ...updateDto };

    it('debería actualizar un proveedor', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue(updatedSupplier);

      const result = await service.update(mockSupplierId, updateDto);
      expect(MockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockSupplierId, ...ACTIVE_FILTER },
        updateDto,
        { new: true },
      );
      expect(result).toEqual(updatedSupplier);
    });

    it('debería lanzar NotFoundException si el proveedor no existe', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue(null);
      await expect(service.update(mockSupplierId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar BadRequestException si no hay campos para actualizar', async () => {
      await expect(service.update(mockSupplierId, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('debería lanzar ConflictException si otro proveedor ya usa el nombre', async () => {
      mockExecFindOne.mockResolvedValue({ _id: 'otro', name: 'Otro' });

      await expect(
        service.update(mockSupplierId, { name: 'otro' }),
      ).rejects.toThrow(ConflictException);
      expect(MockModel.findOne).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        name: { $regex: '^otro$', $options: 'i' },
        _id: { $ne: mockSupplierId },
      });
    });

    it('debería convertir el error de clave duplicada en ConflictException', async () => {
      mockExecFindOneAndUpdate.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
      );

      await expect(
        service.update(mockSupplierId, { name: 'Otro' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('debería desactivar el proveedor en vez de borrarlo', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue({
        ...mockSupplier,
        isActive: false,
      });

      await expect(service.remove(mockSupplierId)).resolves.toBeUndefined();
      expect(MockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockSupplierId, ...ACTIVE_FILTER },
        { isActive: false },
        { new: true },
      );
    });

    it('debería lanzar NotFoundException si el proveedor no existe o ya está inactivo', async () => {
      mockExecFindOneAndUpdate.mockResolvedValue(null);
      await expect(service.remove(mockSupplierId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar NotFoundException si el ID no es un ObjectId válido', async () => {
      await expect(service.remove('abc')).rejects.toThrow(NotFoundException);
      expect(MockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('assertAssignable', () => {
    it('acepta un proveedor activo', async () => {
      mockExecFindOne.mockResolvedValue(mockSupplier);

      await expect(
        service.assertAssignable(mockSupplierId),
      ).resolves.toBeUndefined();
      expect(MockModel.findOne).toHaveBeenCalledWith({
        _id: mockSupplierId,
        ...ACTIVE_FILTER,
      });
    });

    it('rechaza un proveedor inexistente, dado de baja o con ID inválido', async () => {
      mockExecFindOne.mockResolvedValue(null);

      await expect(service.assertAssignable(mockSupplierId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.assertAssignable('abc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('onModuleInit', () => {
    it('elimina los índices legados y normaliza isActive', async () => {
      const dropIndex = vi.fn().mockResolvedValue(undefined);
      const model = MockModel as unknown as Record<string, unknown>;
      model.collection = { dropIndex };
      model.updateMany = vi
        .fn()
        .mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });

      await service.onModuleInit();

      expect(dropIndex).toHaveBeenCalledWith('name_1');
      expect(dropIndex).toHaveBeenCalledWith('name_unique_ci');
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
});
