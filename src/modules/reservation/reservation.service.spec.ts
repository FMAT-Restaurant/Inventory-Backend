import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import {
  INVENTORY_EXCHANGE,
  InventoryRoutingKeys,
} from '../../broker/event-conventions.js';
import { ReservationCacheService } from './reservation-cache.service.js';
import { ReservationService } from './reservation.service.js';
import { ReservationStatus } from './schemas/stock-reservation.schema.js';

const ITEM_A = '507f1f77bcf86cd799439011';
const ITEM_B = '507f1f77bcf86cd799439012';

function item(id: string, totalStock: number, reservedStock = 0) {
  return { _id: id, name: `Item ${id}`, totalStock, reservedStock };
}

describe('ReservationService', () => {
  let service: ReservationService;
  let model: any;
  let itemService: {
    findOne: ReturnType<typeof vi.fn>;
    reserveStock: ReturnType<typeof vi.fn>;
    adjustReservedStock: ReturnType<typeof vi.fn>;
  };
  let publisher: { publish: ReturnType<typeof vi.fn> };

  const findOneExec = vi.fn();
  const findOneAndUpdateExec = vi.fn();
  const findExec = vi.fn();
  const save = vi.fn();

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
    };
    publisher = { publish: vi.fn().mockResolvedValue(undefined) };

    service = new ReservationService(
      model,
      {} as any, // recipeModel
      itemService as any,
      new ReservationCacheService(),
      publisher as any,
      { findOne: vi.fn() } as any, // recipeService
      { consumeByFefo: vi.fn() } as any, // batchService
      { record: vi.fn() } as any, // stockMovementService
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
});
