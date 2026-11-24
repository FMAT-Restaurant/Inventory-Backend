import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockMovementType } from '../stock-movement/schemas/stock-movement.schema.js';
import { ReservationStatus } from './schemas/stock-reservation.schema.js';
import { WasteService } from './waste.service.js';

const BATCH_A = '60d5ec9af682fbd39a1b865b';
const BATCH_B = '60d5ec9af682fbd39a1b865c';
const ITEM_QUESO = '507f1f77bcf86cd799439011';
const ITEM_PAN = '507f1f77bcf86cd799439012';

function exec<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

describe('WasteService', () => {
  const reservationModel = { findOne: vi.fn() };
  const recipeModel = { findOne: vi.fn() };
  const stockMovementService = {
    record: vi.fn(),
    findAll: vi.fn(),
    findAllUnpaginated: vi.fn(),
  };
  const batchService = { registerWaste: vi.fn(), findOne: vi.fn() };
  const reservationService = { releaseDish: vi.fn() };
  let service: WasteService;

  function consumedReservation(overrides: Record<string, unknown> = {}) {
    return {
      orderId: 'O-1',
      status: ReservationStatus.CONSUMED,
      lines: [{ offerId: 'offer-1', plateId: 'plate-1', quantity: 2 }],
      ...overrides,
    };
  }

  function movementsByType(outs: unknown[], wastes: unknown[] = []) {
    stockMovementService.findAllUnpaginated.mockImplementation(
      async (query: { movementType: StockMovementType }) =>
        query.movementType === StockMovementType.OUT ? outs : wastes,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    reservationModel.findOne.mockReturnValue(exec(consumedReservation()));
    recipeModel.findOne.mockReturnValue(
      exec({
        items: [
          { itemId: ITEM_QUESO, requiredQuantity: 50 },
          { itemId: ITEM_PAN, requiredQuantity: 1 },
        ],
      }),
    );
    batchService.findOne.mockImplementation(async (id: string) => ({
      _id: id,
      itemId: id === BATCH_A ? ITEM_QUESO : ITEM_PAN,
    }));
    movementsByType([
      { batchId: BATCH_A, quantity: 100 },
      { batchId: BATCH_B, quantity: 2 },
    ]);
    stockMovementService.record.mockResolvedValue({});
    service = new WasteService(
      reservationModel as never,
      recipeModel as never,
      stockMovementService as never,
      batchService as never,
      reservationService as never,
    );
  });

  describe('merma manual', () => {
    it('solo necesita lote, cantidad y motivo, y descuenta del lote', async () => {
      const movement = { _id: 'm1', movementType: StockMovementType.WASTE };
      batchService.registerWaste.mockResolvedValue({ batch: {}, movement });

      const result = await service.registerManual(
        { batchId: BATCH_A, quantity: 3, reason: 'Se cayó' },
        'user-1',
      );

      expect(batchService.registerWaste).toHaveBeenCalledWith(
        BATCH_A,
        3,
        'Se cayó',
        'user-1',
      );
      expect(result).toBe(movement);
    });

    it('propaga el error si la cantidad excede el lote', async () => {
      batchService.registerWaste.mockRejectedValue(new Error('excede'));

      await expect(
        service.registerManual(
          { batchId: BATCH_A, quantity: 999, reason: 'x' },
          'user-1',
        ),
      ).rejects.toThrow('excede');
    });
  });

  describe('merma de una orden (evento de Órdenes)', () => {
    const event = {
      eventId: 'E-1',
      orderId: 'O-1',
      reason: 'Comanda anulada',
      lines: [{ offerId: 'offer-1', quantity: 1 }],
    };

    it('registra la merma por insumo en los lotes que consumió la orden, sin descontar stock', async () => {
      const result = await service.registerOrderWaste(event);

      expect(result).toEqual({ recorded: 2, skipped: 0 });
      expect(stockMovementService.record).toHaveBeenCalledWith({
        batchId: BATCH_A,
        movementType: StockMovementType.WASTE,
        quantity: 50,
        referenceId: 'O-1',
        reason: 'Comanda anulada',
        createdBy: 'ordenes',
      });
      expect(stockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: BATCH_B, quantity: 1 }),
      );
      expect(batchService.registerWaste).not.toHaveBeenCalled();
    });

    it('encuentra la receta con la oferta usando las líneas de la reserva', async () => {
      await service.registerOrderWaste(event);

      expect(recipeModel.findOne).toHaveBeenCalledWith({ plateId: 'plate-1' });
    });

    it('no registra más de lo que la orden consumió', async () => {
      movementsByType(
        [{ batchId: BATCH_A, quantity: 100 }],
        [{ batchId: BATCH_A, quantity: 80 }],
      );

      await service.registerOrderWaste(event);

      expect(stockMovementService.record).toHaveBeenCalledTimes(1);
      expect(stockMovementService.record).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: BATCH_A, quantity: 20 }),
      );
    });

    it('dos mermas simultáneas de la misma orden no pasan de lo consumido', async () => {
      const recorded: Array<{ batchId: string; quantity: number }> = [];
      stockMovementService.record.mockImplementation(
        async (input: { batchId: string; quantity: number }) => {
          // simula la latencia de la base entre escribir y volver a leer
          await new Promise((resolve) => setTimeout(resolve, 5));
          recorded.push(input);
          return {};
        },
      );
      stockMovementService.findAllUnpaginated.mockImplementation(
        async (query: { movementType: StockMovementType }) =>
          query.movementType === StockMovementType.OUT
            ? [{ batchId: BATCH_A, quantity: 50 }]
            : recorded
                .filter((r) => r.batchId === BATCH_A)
                .map((r) => ({ batchId: r.batchId, quantity: r.quantity })),
      );
      recipeModel.findOne.mockReturnValue(
        exec({ items: [{ itemId: ITEM_QUESO, requiredQuantity: 50 }] }),
      );

      await Promise.all([
        service.registerOrderWaste(event),
        service.registerOrderWaste({ ...event, eventId: 'E-otro' }),
      ]);

      expect(recorded).toHaveLength(1);
      expect(recorded[0].quantity).toBe(50);
    });

    it('ignora la merma de una orden sin consumo', async () => {
      reservationModel.findOne.mockReturnValue(
        exec(consumedReservation({ status: ReservationStatus.CONFIRMED })),
      );

      const result = await service.registerOrderWaste(event);

      expect(result).toEqual({ recorded: 0, skipped: 1 });
      expect(stockMovementService.record).not.toHaveBeenCalled();
    });

    it('omite el platillo cuya receta no se puede determinar', async () => {
      reservationModel.findOne.mockReturnValue(
        exec(consumedReservation({ lines: [] })),
      );

      const result = await service.registerOrderWaste(event);

      expect(result).toEqual({ recorded: 0, skipped: 1 });
      expect(stockMovementService.record).not.toHaveBeenCalled();
    });
  });

  describe('platillo rechazado por cocina', () => {
    const rejected = {
      eventId: 'E-2',
      orderId: 'O-1',
      offerId: 'offer-1',
      plateId: 'plate-1',
      quantity: 1,
      reason: 'Carne en mal estado',
    };

    it('con la orden reservada libera el platillo sin registrar merma', async () => {
      reservationModel.findOne.mockReturnValue(
        exec(consumedReservation({ status: ReservationStatus.CONFIRMED })),
      );
      reservationService.releaseDish.mockResolvedValue('released');

      await service.handleDishRejected(rejected);

      expect(reservationService.releaseDish).toHaveBeenCalledWith({
        orderId: 'O-1',
        plateId: 'plate-1',
        offerId: 'offer-1',
        quantity: 1,
        reason: 'Carne en mal estado',
      });
      expect(stockMovementService.record).not.toHaveBeenCalled();
    });

    it('si la orden ya se consumió registra la merma', async () => {
      await service.handleDishRejected(rejected);

      expect(reservationService.releaseDish).not.toHaveBeenCalled();
      expect(stockMovementService.record).toHaveBeenCalled();
    });
  });
});
