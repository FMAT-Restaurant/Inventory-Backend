import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { StockMovementController } from './stock-movement.controller.js';
import { StockMovementService } from './stock-movement.service.js';
import { StockMovementType } from './schemas/stock-movement.schema.js';

describe('StockMovementController', () => {
  let controller: StockMovementController;
  let service: StockMovementService;

  const mockMovements = [
    {
      _id: 'mov-1',
      batchId: '507f1f77bcf86cd799439011',
      movementType: 'in',
      quantity: 10,
      referenceId: null,
      reason: 'Alta de lote',
      createdBy: 'system',
    },
  ];

  const mockStockMovementService = {
    findAll: vi.fn().mockResolvedValue(mockMovements),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockMovementController],
      providers: [
        {
          provide: StockMovementService,
          useValue: mockStockMovementService,
        },
      ],
    }).compile();

    controller = module.get<StockMovementController>(StockMovementController);
    service = module.get<StockMovementService>(StockMovementService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debería consultar movimientos con los filtros recibidos', async () => {
    const query = { movementType: StockMovementType.OUT, limit: 5 };

    const result = await controller.findAll(query);

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockMovements);
  });
});
