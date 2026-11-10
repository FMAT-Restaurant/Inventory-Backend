import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  INVENTORY_EXCHANGE,
  InventoryRoutingKeys,
} from '../../broker/event-conventions.js';
import { ReservationCacheService } from './reservation-cache.service.js';
import {
  ReservationService,
  resolveReservationTtlMinutes,
} from './reservation.service.js';
import { ReservationStatus } from './schemas/stock-reservation.schema.js';

const ITEM_A = '507f1f77bcf86cd799439011';
const ITEM_B = '507f1f77bcf86cd799439012';

function item(id: string, totalStock: number, reservedStock = 0) {
  return { _id: id, name: `Item ${id}`, totalStock, reservedStock };
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'O-1',
    status: ReservationStatus.PENDING,
    items: [],
    expiresAt: null,
    eventId: null,
    correlationId: null,
    reason: null,
    ...overrides,
  };
}

describe('ReservationService', () => {
  let service: ReservationService;
  let model: any;
  let itemService: {
    findOne: ReturnType<typeof vi.fn>;
    reserveStock: ReturnType<typeof vi.fn>;
    adjustReservedStock: ReturnType<typeof vi.fn>;
    registerRemovalGuard: ReturnType<typeof vi.fn>;
  };
  let publisher: { publish: ReturnType<typeof vi.fn> };
  let recipeModel: { findOne: ReturnType<typeof vi.fn> };
  let batchService: { consumeByFefo: ReturnType<typeof vi.fn> };
  let stockMovementService: { record: ReturnType<typeof vi.fn> };
  let cache: ReservationCacheService;

  const findOneExec = vi.fn();
  const findOneAndUpdateExec = vi.fn();
  const findExec = vi.fn();
  const save = vi.fn();
  const recipeFindExec = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESERVATION_TTL_MINUTES = '30';

    function MockModel(this: any, dto: any) {
      Object.assign(this, dto);
      this.save = save;
    }
    MockModel.findOne = vi.fn().mockReturnValue({ exec: findOneExec });
    MockModel.findOneAndUpdate = vi
      .fn()
      .mockReturnValue({ exec: findOneAndUpdateExec });

    const findChain: any = {};
    findChain.sort = vi.fn(() => findChain);
    findChain.limit = vi.fn(() => findChain);
    findChain.exec = findExec;
    MockModel.find = vi.fn().mockReturnValue(findChain);
    model = MockModel;

    itemService = {
      findOne: vi.fn(),
      reserveStock: vi.fn(),
      adjustReservedStock: vi.fn().mockResolvedValue({}),
      registerRemovalGuard: vi.fn(),
    };
    publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    recipeModel = { findOne: vi.fn().mockReturnValue({ exec: recipeFindExec }) };
    batchService = { consumeByFefo: vi.fn().mockResolvedValue(undefined) };
    stockMovementService = { record: vi.fn() };
    cache = new ReservationCacheService();

    service = new ReservationService(
      model,
      recipeModel as any,
      itemService as any,
      cache,
      publisher as any,
      { findOne: vi.fn() } as any, // recipeService
      batchService as any,
      stockMovementService as any,
    );
  });

  it('reserva stock y publica la confirmación', async () => {
    findOneExec.mockResolvedValue(null);
    itemService.findOne.mockResolvedValue(item(ITEM_A, 10));
    itemService.reserveStock.mockResolvedValue(item(ITEM_A, 10, 2));
    const saved = {
      orderId: 'O-1',
      status: ReservationStatus.PENDING,
      items: [{ itemId: ITEM_A, quantity: 2 }],
      expiresAt: new Date(Date.now() + 1000),
      eventId: 'E-1',
    };
    save.mockResolvedValue(saved);

    const result = await service.reserve({
      orderId: 'O-1',
      items: [{ itemId: ITEM_A, quantity: 2 }],
      eventId: 'E-1',
    });

    expect(result).toBe(saved);
    expect(itemService.reserveStock).toHaveBeenCalledWith(ITEM_A, 2);
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationConfirmed,
      expect.objectContaining({
        orderId: 'O-1',
        status: ReservationStatus.PENDING,
      }),
    );
  });

  it('es idempotente por orderId y no vuelve a reservar', async () => {
    const existing = {
      orderId: 'O-1',
      status: ReservationStatus.CONFIRMED,
      items: [],
    };
    findOneExec.mockResolvedValue(existing);

    await expect(
      service.reserve({
        orderId: 'O-1',
        items: [{ itemId: ITEM_A, quantity: 2 }],
      }),
    ).resolves.toBe(existing);
    expect(itemService.reserveStock).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('publica rechazo sin reservar si el stock disponible es insuficiente', async () => {
    findOneExec.mockResolvedValue(null);
    itemService.findOne.mockResolvedValue(item(ITEM_A, 1));

    await expect(
      service.reserve({
        orderId: 'O-1',
        items: [{ itemId: ITEM_A, quantity: 2 }],
      }),
    ).resolves.toBeNull();

    expect(itemService.reserveStock).not.toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationRejected,
      expect.objectContaining({ orderId: 'O-1', status: 'rejected' }),
    );
  });

  it('revierte las reservas parciales cuando falla un item a mitad del proceso', async () => {
    findOneExec.mockResolvedValue(null);
    itemService.findOne.mockImplementation((id: string) =>
      Promise.resolve(item(id, 10)),
    );
    itemService.reserveStock
      .mockResolvedValueOnce(item(ITEM_A, 10, 2))
      .mockResolvedValueOnce(null);

    await expect(
      service.reserve({
        orderId: 'O-1',
        items: [
          { itemId: ITEM_A, quantity: 2 },
          { itemId: ITEM_B, quantity: 3 },
        ],
      }),
    ).resolves.toBeNull();

    expect(itemService.adjustReservedStock).toHaveBeenCalledTimes(1);
    expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationRejected,
      expect.any(Object),
    );
  });

  it('confirma una reserva pendiente y publica el resultado', async () => {
    const pending = {
      orderId: 'O-1',
      status: ReservationStatus.PENDING,
      items: [],
    };
    const confirmed = { ...pending, status: ReservationStatus.CONFIRMED };
    findOneExec.mockResolvedValue(pending);
    findOneAndUpdateExec.mockResolvedValue(confirmed);

    await expect(service.confirm('O-1', 'E-2')).resolves.toBe(confirmed);
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationConfirmed,
      expect.objectContaining({ orderId: 'O-1' }),
    );
  });

  it('publica rechazo al confirmar una orden sin reserva', async () => {
    findOneExec.mockResolvedValue(null);

    await expect(service.confirm('O-404')).resolves.toBeNull();
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationRejected,
      expect.objectContaining({ orderId: 'O-404', status: 'rejected' }),
    );
  });

  it('rechaza la orden completa si contiene items inválidos', async () => {
    findOneExec.mockResolvedValue(null);

    await expect(
      service.reserve({
        orderId: 'O-1',
        items: [{ itemId: 'no-es-object-id', quantity: 1 }],
      }),
    ).resolves.toBeNull();

    expect(itemService.findOne).not.toHaveBeenCalled();
    expect(itemService.reserveStock).not.toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationRejected,
      expect.objectContaining({ orderId: 'O-1', status: 'rejected' }),
    );
  });

  it('expira una reserva pendiente vencida antes de confirmarla', async () => {
    const pending = {
      orderId: 'O-1',
      status: ReservationStatus.PENDING,
      expiresAt: new Date(Date.now() - 1000),
      items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
    };
    findOneExec.mockResolvedValue(pending);
    findOneAndUpdateExec.mockResolvedValue({
      ...pending,
      status: ReservationStatus.EXPIRED,
    });

    const result = await service.confirm('O-1', 'E-2');

    expect(result?.status).toBe(ReservationStatus.EXPIRED);
    expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationExpired,
      expect.objectContaining({ orderId: 'O-1' }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationRejected,
      expect.objectContaining({
        orderId: 'O-1',
        reason: 'La reserva expiró antes de confirmarse',
      }),
    );
  });

  it('libera el stock reservado al cancelar una orden', async () => {
    const pending = {
      orderId: 'O-1',
      status: ReservationStatus.PENDING,
      items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
    };
    findOneExec.mockResolvedValue(pending);
    findOneAndUpdateExec.mockResolvedValue({
      ...pending,
      status: ReservationStatus.RELEASED,
    });

    const result = await service.release('O-1');

    expect(result?.status).toBe(ReservationStatus.RELEASED);
    expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationReleased,
      expect.objectContaining({ orderId: 'O-1' }),
    );
  });

  it('expira reservas pendientes vencidas', async () => {
    const pending = {
      orderId: 'O-1',
      status: ReservationStatus.PENDING,
      expiresAt: new Date(Date.now() - 1000),
      items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
    };
    findExec.mockResolvedValue([pending]);
    findOneExec.mockResolvedValue(pending);
    findOneAndUpdateExec.mockResolvedValue({
      ...pending,
      status: ReservationStatus.EXPIRED,
    });

    await expect(service.expireDue()).resolves.toBe(1);
    expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
    expect(publisher.publish).toHaveBeenCalledWith(
      INVENTORY_EXCHANGE,
      InventoryRoutingKeys.ReservationExpired,
      expect.objectContaining({ orderId: 'O-1' }),
    );
  });

  it('agrupa el stock pendiente por item en el resumen', async () => {
    findExec.mockResolvedValue([
      {
        orderId: 'O-1',
        status: ReservationStatus.PENDING,
        items: [
          { itemId: new Types.ObjectId(ITEM_A), quantity: 2 },
          { itemId: new Types.ObjectId(ITEM_B), quantity: 1 },
        ],
      },
      {
        orderId: 'O-2',
        status: ReservationStatus.PENDING,
        items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 3 }],
      },
    ]);

    await expect(service.getPendingSummary()).resolves.toEqual([
      { itemId: ITEM_A, reservedQuantity: 5, reservationsCount: 2 },
      { itemId: ITEM_B, reservedQuantity: 1, reservationsCount: 1 },
    ]);
  });

  describe('validaciones de entrada', () => {
    it('rechaza una orden sin orderId', async () => {
      await expect(
        service.reserve({
          orderId: '   ',
          items: [{ itemId: ITEM_A, quantity: 1 }],
        }),
      ).resolves.toBeNull();

      expect(findOneExec).not.toHaveBeenCalled();
      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationRejected,
        expect.objectContaining({ orderId: '', reason: 'orderId es obligatorio' }),
      );
    });

    it('rechaza una orden sin items válidos', async () => {
      findOneExec.mockResolvedValue(null);

      await expect(
        service.reserve({ orderId: 'O-1', items: [] }),
      ).resolves.toBeNull();
      await expect(
        service.reserve({ orderId: 'O-1', items: undefined as never }),
      ).resolves.toBeNull();

      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationRejected,
        expect.objectContaining({
          reason: 'La orden no contiene items válidos',
        }),
      );
    });

    it('rechaza líneas con cantidad inválida', async () => {
      findOneExec.mockResolvedValue(null);

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 0 }],
        }),
      ).resolves.toBeNull();

      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationRejected,
        expect.objectContaining({
          reason: 'La orden contiene items inválidos',
        }),
      );
    });

    it('rechaza cuando el item no existe', async () => {
      findOneExec.mockResolvedValue(null);
      itemService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 1 }],
        }),
      ).resolves.toBeNull();

      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationRejected,
        expect.objectContaining({
          reason: `Item '${ITEM_A}' no encontrado`,
        }),
      );
    });

    it('propaga errores de base de datos distintos a NotFound', async () => {
      findOneExec.mockResolvedValue(null);
      itemService.findOne.mockRejectedValue(new Error('conexión perdida'));

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 1 }],
        }),
      ).rejects.toThrow('conexión perdida');
    });
  });

  describe('expansión de plateId', () => {
    it('expande un plato a sus items de receta', async () => {
      findOneExec.mockResolvedValue(null);
      recipeFindExec.mockResolvedValue({
        items: [{ itemId: new Types.ObjectId(ITEM_A), requiredQuantity: 2 }],
      });
      itemService.findOne.mockResolvedValue(item(ITEM_A, 100));
      itemService.reserveStock.mockResolvedValue(item(ITEM_A, 100, 6));
      const saved = reservation({
        orderId: 'O-PLATE',
        items: [{ itemId: ITEM_A, quantity: 6 }],
      });
      save.mockResolvedValue(saved);

      await expect(
        service.reserve({
          orderId: 'O-PLATE',
          items: [{ plateId: 'P-1', quantity: 3 }],
        }),
      ).resolves.toBe(saved);

      expect(recipeModel.findOne).toHaveBeenCalledWith({ plateId: 'P-1' });
      expect(itemService.reserveStock).toHaveBeenCalledWith(ITEM_A, 6);
    });

    it.each([
      ['sin receta', null],
      ['sin items de receta', { items: [] }],
      [
        'con itemId inválido',
        { items: [{ itemId: 'invalido', requiredQuantity: 1 }] },
      ],
      [
        'con cantidad requerida inválida',
        { items: [{ itemId: ITEM_A, requiredQuantity: 0 }] },
      ],
    ])('rechaza un plateId %s', async (_label, recipe) => {
      findOneExec.mockResolvedValue(null);
      recipeFindExec.mockResolvedValue(recipe);

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ plateId: 'P-1', quantity: 1 }],
        }),
      ).resolves.toBeNull();

      expect(itemService.reserveStock).not.toHaveBeenCalled();
    });

    it('rechaza el plateId si la consulta de receta falla', async () => {
      findOneExec.mockResolvedValue(null);
      recipeFindExec.mockRejectedValue(new Error('receta caída'));

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ plateId: 'P-1', quantity: 1 }],
        }),
      ).resolves.toBeNull();

      expect(itemService.reserveStock).not.toHaveBeenCalled();
    });
  });

  describe('errores al ejecutar la reserva', () => {
    it('revierte y reporta stock insuficiente en la carrera de reserva', async () => {
      findOneExec.mockResolvedValue(null);
      itemService.findOne
        .mockResolvedValueOnce(item(ITEM_A, 10))
        .mockResolvedValueOnce(item(ITEM_A, 5));
      itemService.reserveStock.mockResolvedValue(null);

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 2 }],
        }),
      ).resolves.toBeNull();

      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationRejected,
        expect.objectContaining({
          items: [
            expect.objectContaining({
              itemId: ITEM_A,
              availableStock: 5,
            }),
          ],
        }),
      );
    });

    it('usa stock disponible 0 si el item desaparece al reportar el rechazo', async () => {
      findOneExec.mockResolvedValue(null);
      itemService.findOne
        .mockResolvedValueOnce(item(ITEM_A, 10))
        .mockRejectedValueOnce(new Error('item borrado'));
      itemService.reserveStock.mockResolvedValue(null);

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 2 }],
        }),
      ).resolves.toBeNull();

      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationRejected,
        expect.objectContaining({
          items: [expect.objectContaining({ availableStock: 0 })],
        }),
      );
    });

    it('devuelve la reserva concurrente ante una clave duplicada', async () => {
      const concurrent = reservation({ orderId: 'O-1' });
      findOneExec
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(concurrent);
      itemService.findOne.mockResolvedValue(item(ITEM_A, 10));
      itemService.reserveStock.mockResolvedValue(item(ITEM_A, 10, 2));
      save.mockRejectedValue(
        Object.assign(new Error('duplicado'), { code: 11000 }),
      );

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 2 }],
        }),
      ).resolves.toBe(concurrent);

      expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
    });

    it('relanza el duplicado si no encuentra la reserva concurrente', async () => {
      findOneExec.mockResolvedValue(null);
      itemService.findOne.mockResolvedValue(item(ITEM_A, 10));
      itemService.reserveStock.mockResolvedValue(item(ITEM_A, 10, 2));
      save.mockRejectedValue(
        Object.assign(new Error('duplicado'), { code: 11000 }),
      );

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 2 }],
        }),
      ).rejects.toThrow('duplicado');
    });

    it('tolera errores al revertir una reserva parcial', async () => {
      findOneExec.mockResolvedValue(null);
      itemService.findOne.mockResolvedValue(item(ITEM_A, 10));
      itemService.reserveStock.mockResolvedValue(item(ITEM_A, 10, 2));
      itemService.adjustReservedStock.mockRejectedValue(
        new Error('rollback falló'),
      );
      save.mockRejectedValue(new Error('save falló'));

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 2 }],
        }),
      ).rejects.toThrow('save falló');
    });

    it('ignora una reserva existente vencida y libera su stock', async () => {
      const expired = reservation({
        orderId: 'O-1',
        expiresAt: new Date(Date.now() - 1000),
        items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
      });
      findOneExec.mockResolvedValue(expired);
      findOneAndUpdateExec.mockResolvedValue({
        ...expired,
        status: ReservationStatus.EXPIRED,
      });

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 1 }],
        }),
      ).resolves.toBeNull();

      expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
      expect(itemService.reserveStock).not.toHaveBeenCalled();
    });

    it('devuelve la reserva existente si al expirar no queda expirada', async () => {
      const expired = reservation({
        orderId: 'O-1',
        expiresAt: new Date(Date.now() - 1000),
        items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
      });
      const confirmed = { ...expired, status: ReservationStatus.CONFIRMED };
      findOneExec
        .mockResolvedValueOnce(expired)
        .mockResolvedValue(confirmed);
      findOneAndUpdateExec.mockResolvedValue(null);

      await expect(
        service.reserve({
          orderId: 'O-1',
          items: [{ itemId: ITEM_A, quantity: 1 }],
        }),
      ).resolves.toBe(confirmed);

      expect(itemService.reserveStock).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('devuelve la reserva si ya está confirmada', async () => {
      const confirmed = reservation({ status: ReservationStatus.CONFIRMED });
      findOneExec.mockResolvedValue(confirmed);

      await expect(service.confirm('O-1')).resolves.toBe(confirmed);
      expect(findOneAndUpdateExec).not.toHaveBeenCalled();
    });

    it('rechaza confirmar una reserva en estado no confirmable', async () => {
      const released = reservation({ status: ReservationStatus.RELEASED });
      findOneExec.mockResolvedValue(released);

      await expect(service.confirm('O-1')).resolves.toBe(released);
      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationRejected,
        expect.objectContaining({
          reason: expect.stringContaining('no puede confirmarse'),
        }),
      );
    });

    it('devuelve la reserva actualizada si la confirmación atómica no aplica', async () => {
      const pending = reservation();
      findOneExec.mockResolvedValue(pending);
      findOneAndUpdateExec.mockResolvedValue(null);

      await expect(service.confirm('O-1')).resolves.toBe(pending);
    });

    it('devuelve la reserva si al expirar no queda expirada', async () => {
      const expired = reservation({
        expiresAt: new Date(Date.now() - 1000),
        items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
      });
      const confirmed = { ...expired, status: ReservationStatus.CONFIRMED };
      findOneExec
        .mockResolvedValueOnce(expired)
        .mockResolvedValue(confirmed);
      findOneAndUpdateExec.mockResolvedValue(null);

      await expect(service.confirm('O-1')).resolves.toBe(confirmed);
    });
  });

  describe('release', () => {
    it('devuelve null si la reserva no existe', async () => {
      findOneExec.mockResolvedValue(null);

      await expect(service.release('O-404')).resolves.toBeNull();
    });

    it('no libera dos veces una reserva ya expirada', async () => {
      const expired = reservation({ status: ReservationStatus.EXPIRED });
      findOneExec.mockResolvedValue(expired);

      await expect(
        service.release('O-1', ReservationStatus.EXPIRED),
      ).resolves.toBe(expired);

      expect(itemService.adjustReservedStock).not.toHaveBeenCalled();
    });

    it('no libera una reserva ya consumida', async () => {
      const consumed = reservation({ status: ReservationStatus.CONSUMED });
      findOneExec.mockResolvedValue(consumed);

      await expect(service.release('O-1')).resolves.toBe(consumed);
      expect(itemService.adjustReservedStock).not.toHaveBeenCalled();
    });

    it('tolera que falle la liberación de stock', async () => {
      const pending = reservation({
        items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
      });
      const released = { ...pending, status: ReservationStatus.RELEASED };
      findOneExec.mockResolvedValue(pending);
      findOneAndUpdateExec.mockResolvedValue(released);
      itemService.adjustReservedStock.mockRejectedValue(
        new Error('item caído'),
      );

      await expect(service.release('O-1')).resolves.toBe(released);
    });
  });

  describe('findAll', () => {
    it('usa la caché para consultas repetidas', async () => {
      const rows = [reservation()];
      findExec.mockResolvedValue(rows);

      await expect(service.findAll({ status: ReservationStatus.PENDING })).resolves.toBe(rows);
      await expect(service.findAll({ status: ReservationStatus.PENDING })).resolves.toBe(rows);

      expect((model as any).find).toHaveBeenCalledOnce();
    });

    it('aplica filtros de estado, orden, item y límite', async () => {
      findExec.mockResolvedValue([]);

      await service.findAll({
        status: ReservationStatus.PENDING,
        orderId: 'O-1',
        itemId: ITEM_A,
        limit: 5,
      });

      const filter = (model as any).find.mock.calls[0][0];
      expect(filter).toMatchObject({
        status: ReservationStatus.PENDING,
        orderId: 'O-1',
        $or: expect.any(Array),
      });
      expect(filter['items.itemId'].toString()).toBe(ITEM_A);
      const chain = (model as any).find.mock.results[0].value;
      expect(chain.limit).toHaveBeenCalledWith(5);
    });

    it('devuelve vacío si el itemId no es ObjectId', async () => {
      await expect(service.findAll({ itemId: 'invalido' })).resolves.toEqual(
        [],
      );
      expect((model as any).find).not.toHaveBeenCalled();
    });
  });

  describe('findByOrderId', () => {
    it('usa la caché de orden', async () => {
      const pending = reservation();
      findOneExec.mockResolvedValue(pending);

      await expect(service.findByOrderId('O-1')).resolves.toBe(pending);
      await expect(service.findByOrderId('O-1')).resolves.toBe(pending);

      expect(findOneExec).toHaveBeenCalledOnce();
    });

    it('lanza NotFound cuando no existe', async () => {
      findOneExec.mockResolvedValue(null);

      await expect(service.findByOrderId('O-404')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('libera y devuelve la reserva expirada', async () => {
      const expired = reservation({
        expiresAt: new Date(Date.now() - 1000),
        items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
      });
      findOneExec.mockResolvedValue(expired);
      findOneAndUpdateExec.mockResolvedValue({
        ...expired,
        status: ReservationStatus.EXPIRED,
      });

      const result = await service.findByOrderId('O-1');

      expect(result.status).toBe(ReservationStatus.EXPIRED);
      expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
    });
  });

  describe('consumeServedOrder', () => {
    it('ignora una orden sin orderId', async () => {
      await expect(
        service.consumeServedOrder({ orderId: '  ', eventId: 'E-1' }),
      ).resolves.toBeNull();
      expect(findOneExec).not.toHaveBeenCalled();
    });

    it('devuelve la reserva si ya fue consumida', async () => {
      const consumed = reservation({ status: ReservationStatus.CONSUMED });
      findOneExec.mockResolvedValue(consumed);

      await expect(
        service.consumeServedOrder({ orderId: 'O-1', eventId: 'E-1' }),
      ).resolves.toBe(consumed);
      expect(batchService.consumeByFefo).not.toHaveBeenCalled();
    });

    it('no consume si no hay items ni reserva', async () => {
      findOneExec.mockResolvedValue(null);

      await expect(
        service.consumeServedOrder({ orderId: 'O-1', eventId: 'E-1' }),
      ).resolves.toBeNull();
      expect(batchService.consumeByFefo).not.toHaveBeenCalled();
    });

    it('aborta si las líneas del evento son inválidas y no hay reserva', async () => {
      findOneExec.mockResolvedValue(null);

      await expect(
        service.consumeServedOrder({
          orderId: 'O-1',
          eventId: 'E-1',
          items: [{ quantity: 0 }],
        }),
      ).resolves.toBeNull();
      expect(batchService.consumeByFefo).not.toHaveBeenCalled();
    });

    it('consume los items del evento aunque no exista reserva', async () => {
      findOneExec.mockResolvedValue(null);

      await expect(
        service.consumeServedOrder({
          orderId: 'O-1',
          eventId: 'E-1',
          items: [{ itemId: ITEM_A, quantity: 2 }],
        }),
      ).resolves.toBeNull();

      expect(batchService.consumeByFefo).toHaveBeenCalledWith(
        ITEM_A,
        2,
        'O-1',
        'Consumo por orden servida',
      );
      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationConsumed,
        expect.objectContaining({ orderId: 'O-1' }),
      );
    });

    it('consume la reserva persistida y la marca como consumida', async () => {
      const pending = reservation({
        items: [{ itemId: new Types.ObjectId(ITEM_A), quantity: 2 }],
      });
      const consumed = { ...pending, status: ReservationStatus.CONSUMED };
      findOneExec.mockResolvedValue(pending);
      findOneAndUpdateExec.mockResolvedValue(consumed);
      batchService.consumeByFefo.mockRejectedValueOnce(
        new Error('fefo caído'),
      );

      const result = await service.consumeServedOrder({
        orderId: 'O-1',
        eventId: 'E-1',
        reason: 'Mesa 3',
      });

      expect(result).toBe(consumed);
      expect(batchService.consumeByFefo).toHaveBeenCalledWith(
        ITEM_A,
        2,
        'O-1',
        'Consumo por orden servida',
      );
      expect(itemService.adjustReservedStock).toHaveBeenCalledWith(ITEM_A, -2);
      expect(publisher.publish).toHaveBeenCalledWith(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.ReservationConsumed,
        expect.objectContaining({ reason: 'Mesa 3' }),
      );
    });

    it('tolera que falle la publicación del evento de consumo', async () => {
      findOneExec.mockResolvedValue(null);
      const publishResultSpy = vi
        .spyOn(
          service as unknown as {
            publishResult: (key: string, event: unknown) => Promise<void>;
          },
          'publishResult',
        )
        .mockRejectedValue(new Error('broker caído'));

      await expect(
        service.consumeServedOrder({
          orderId: 'O-1',
          eventId: 'E-1',
          items: [{ itemId: ITEM_A, quantity: 1 }],
        }),
      ).resolves.toBeNull();

      expect(publishResultSpy).toHaveBeenCalled();
    });
  });

  describe('aggregateItems', () => {
    it('agrupa items válidos y descarta los inválidos', () => {
      const result = (
        service as unknown as {
          aggregateItems: (items: unknown) => {
            valid: Array<{ itemId: string; quantity: number }>;
            invalid: unknown[];
          };
        }
      ).aggregateItems([
        { plateId: 'P-1', quantity: 1 },
        { itemId: ITEM_A, quantity: 2 },
        { itemId: 'invalido', quantity: 1 },
        { itemId: ITEM_B, quantity: 0 },
      ]);

      expect(result.valid).toEqual([{ itemId: ITEM_A, quantity: 2 }]);
      expect(result.invalid).toHaveLength(3);
      expect(
        (
          service as unknown as {
            aggregateItems: (items: unknown) => unknown;
          }
        ).aggregateItems('invalido'),
      ).toEqual({ valid: [], invalid: [] });
    });
  });

  describe('regla de baja de items', () => {
    const countExec = vi.fn();

    beforeEach(() => {
      model.countDocuments = vi.fn().mockReturnValue({ exec: countExec });
      service.onModuleInit();
    });

    function registeredGuard(): (itemId: string) => Promise<string | null> {
      return itemService.registerRemovalGuard.mock.calls[0][0];
    }

    it('impide la baja de un item con reservas activas', async () => {
      countExec.mockResolvedValue(2);

      await expect(registeredGuard()(ITEM_A)).resolves.toContain(
        'tiene 2 reserva(s) activa(s)',
      );
      expect(model.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          status: {
            $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
        }),
      );
    });

    it('permite la baja si el item no tiene reservas activas', async () => {
      countExec.mockResolvedValue(0);

      await expect(registeredGuard()(ITEM_A)).resolves.toBeNull();
    });
  });
});

describe('resolveReservationTtlMinutes', () => {
  const original = process.env.RESERVATION_TTL_MINUTES;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RESERVATION_TTL_MINUTES;
    } else {
      process.env.RESERVATION_TTL_MINUTES = original;
    }
  });

  it.each([
    [undefined, 30],
    ['0', 0],
    ['15', 15],
    ['-5', 30],
    ['no-es-numero', 30],
  ])('resuelve el TTL para %s', (value, expected) => {
    if (value === undefined) {
      delete process.env.RESERVATION_TTL_MINUTES;
    } else {
      process.env.RESERVATION_TTL_MINUTES = value;
    }

    expect(resolveReservationTtlMinutes()).toBe(expected);
  });
});
