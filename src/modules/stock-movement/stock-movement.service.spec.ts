import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service.js';
import {
  StockMovement,
  StockMovementType,
} from './schemas/stock-movement.schema.js';

describe('StockMovementService', () => {
  let service: StockMovementService;

  const mockSave = vi.fn();
  const mockExec = vi.fn();
  const mockExecCount = vi.fn();
  const mockLimit = vi.fn();
  const mockSkip = vi.fn();
  const mockSort = vi.fn();
  const mockFind = vi.fn();
  const mockCountDocuments = vi.fn();

  const mockBatchId = '507f1f77bcf86cd799439011';

  function MockModel(
    this: Record<string, unknown>,
    dto: Record<string, unknown>,
  ) {
    Object.assign(this, dto);
    this.save = () => mockSave(this);
  }
  MockModel.find = mockFind;
  MockModel.countDocuments = mockCountDocuments;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSort.mockReturnValue({ skip: mockSkip });
    mockSkip.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ exec: mockExec });
    mockFind.mockReturnValue({ sort: mockSort });
    mockCountDocuments.mockReturnValue({ exec: mockExecCount });
    mockExec.mockResolvedValue([]);
    mockExecCount.mockResolvedValue(0);
    mockSave.mockImplementation(async (doc: Record<string, unknown>) => ({
      _id: 'mov-1',
      ...doc,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementService,
        {
          provide: getModelToken(StockMovement.name),
          useValue: MockModel,
        },
      ],
    }).compile();

    service = module.get<StockMovementService>(StockMovementService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('registra un movimiento y redondea la cantidad a 3 decimales', async () => {
      const result = await service.record({
        batchId: mockBatchId,
        movementType: StockMovementType.IN,
        quantity: 10.12349,
        reason: 'Alta de lote',
      });

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        batchId: expect.anything(),
        movementType: StockMovementType.IN,
        quantity: 10.123,
        reason: 'Alta de lote',
        createdBy: 'system',
      });
    });

    it('rechaza un batchId que no es ObjectId', async () => {
      await expect(
        service.record({
          batchId: 'invalido',
          movementType: StockMovementType.IN,
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('rechaza entradas con cantidad menor o igual a 0', async () => {
      await expect(
        service.record({
          batchId: mockBatchId,
          movementType: StockMovementType.OUT,
          quantity: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza ajustes con cantidad 0', async () => {
      await expect(
        service.record({
          batchId: mockBatchId,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite ajustes negativos', async () => {
      await expect(
        service.record({
          batchId: mockBatchId,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: -5,
        }),
      ).resolves.toBeDefined();
    });

    it('respeta el createdBy recibido', async () => {
      const result = await service.record({
        batchId: mockBatchId,
        movementType: StockMovementType.WASTE,
        quantity: 2,
        createdBy: 'chef-1',
      });

      expect(result).toMatchObject({ createdBy: 'chef-1' });
    });
  });

  describe('findAll', () => {
    it('consulta paginado ordenando por createdAt descendente', async () => {
      mockExecCount.mockResolvedValue(0);
      mockExec.mockResolvedValue([]);

      const result = await service.findAll();

      expect(mockCountDocuments).toHaveBeenCalledWith({});
      expect(mockFind).toHaveBeenCalledWith({});
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(mockSkip).toHaveBeenCalledWith(0);
      expect(mockLimit).toHaveBeenCalledWith(20);
      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('aplica filtros de lote, tipo, referencia y fechas', async () => {
      mockExecCount.mockResolvedValue(0);
      mockExec.mockResolvedValue([]);

      await service.findAll({
        batchId: mockBatchId,
        movementType: StockMovementType.OUT,
        referenceId: 'orden-1',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-30T23:59:59.999Z',
      });

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: StockMovementType.OUT,
          referenceId: 'orden-1',
          createdAt: {
            $gte: new Date('2026-11-01T00:00:00.000Z'),
            $lte: new Date('2026-11-30T23:59:59.999Z'),
          },
        }),
      );
    });

    it('retorna resultado vacío si el batchId no es un ObjectId válido', async () => {
      const result = await service.findAll({ batchId: 'invalido' });

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(mockFind).not.toHaveBeenCalled();
      expect(mockCountDocuments).not.toHaveBeenCalled();
    });

    it('aplica la paginación cuando se recibe page/limit', async () => {
      mockExecCount.mockResolvedValue(0);
      mockExec.mockResolvedValue([]);

      await service.findAll({ page: 2, limit: 10 });

      expect(mockSkip).toHaveBeenCalledWith(10);
      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });
});
