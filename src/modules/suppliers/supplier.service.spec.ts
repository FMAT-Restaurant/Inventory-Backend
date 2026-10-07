import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SupplierService } from './supplier.service.js';
import { Supplier } from './schemas/supplier.schema.js';

describe('SupplierService', () => {
  let service: SupplierService;

  const mockExecFind = vi.fn();
  const mockExecFindById = vi.fn();
  const mockExecFindByIdAndUpdate = vi.fn();
  const mockExecDeleteOne = vi.fn();
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
  MockModel.findById = vi.fn().mockReturnValue({ exec: mockExecFindById });
  MockModel.findByIdAndUpdate = vi.fn().mockReturnValue({ exec: mockExecFindByIdAndUpdate });
  MockModel.deleteOne = vi.fn().mockReturnValue({ exec: mockExecDeleteOne });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({});

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
      expect(MockModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockSupplier]);
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
  });

  describe('update', () => {
    const updateDto = { phone: '+52 55 0000 0000' };
    const updatedSupplier = { ...mockSupplier, ...updateDto };

    it('debería actualizar un proveedor', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue(updatedSupplier);

      const result = await service.update(mockSupplierId, updateDto);
      expect(MockModel.findByIdAndUpdate).toHaveBeenCalledWith(mockSupplierId, updateDto, {
        new: true,
      });
      expect(result).toEqual(updatedSupplier);
    });

    it('debería lanzar NotFoundException si el proveedor no existe', async () => {
      mockExecFindByIdAndUpdate.mockResolvedValue(null);
      await expect(service.update(mockSupplierId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('debería eliminar un proveedor', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 1 });
      await service.remove(mockSupplierId);
      expect(MockModel.deleteOne).toHaveBeenCalledWith({ _id: mockSupplierId });
    });

    it('debería lanzar NotFoundException si el proveedor no existe', async () => {
      mockExecDeleteOne.mockResolvedValue({ deletedCount: 0 });
      await expect(service.remove(mockSupplierId)).rejects.toThrow(NotFoundException);
    });
  });
});
