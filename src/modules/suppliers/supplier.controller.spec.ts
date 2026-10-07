import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { SuppliersController } from './supplier.controller.js';
import { SupplierService } from './supplier.service.js';

describe('SuppliersController', () => {
  let controller: SuppliersController;
  let service: SupplierService;

  const mockSupplier = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Distribuidora Central',
    contactName: 'Juan Pérez',
    phone: '+52 55 1234 5678',
    email: 'contacto@proveedor.com',
    address: 'Av. Reforma 123, CDMX',
  };

  const mockSupplierService = {
    create: vi.fn().mockResolvedValue(mockSupplier),
    findAll: vi.fn().mockResolvedValue([mockSupplier]),
    findOne: vi.fn().mockResolvedValue(mockSupplier),
    update: vi.fn().mockResolvedValue(mockSupplier),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [
        {
          provide: SupplierService,
          useValue: mockSupplierService,
        },
      ],
    }).compile();

    controller = module.get<SuppliersController>(SuppliersController);
    service = module.get<SupplierService>(SupplierService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar un array de proveedores', async () => {
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockSupplier]);
    });
  });

  describe('findOne', () => {
    it('debería retornar un proveedor por su id', async () => {
      const result = await controller.findOne('507f1f77bcf86cd799439011');
      expect(service.findOne).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockSupplier);
    });
  });

  describe('create', () => {
    it('debería crear un nuevo proveedor', async () => {
      const dto = {
        name: 'Distribuidora Central',
        email: 'contacto@proveedor.com',
      };
      const result = await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSupplier);
    });
  });

  describe('update', () => {
    it('debería actualizar un proveedor', async () => {
      const dto = { phone: '+52 55 0000 0000' };
      const result = await controller.update('507f1f77bcf86cd799439011', dto);
      expect(service.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', dto);
      expect(result).toEqual(mockSupplier);
    });
  });

  describe('remove', () => {
    it('debería eliminar un proveedor', async () => {
      const result = await controller.remove('507f1f77bcf86cd799439011');
      expect(service.remove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(result).toBeUndefined();
    });
  });
});
