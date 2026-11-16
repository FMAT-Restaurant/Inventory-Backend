import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ORDERS_EVENTS_QUEUE,
  ORDERS_EXCHANGES,
  OrdersRoutingKeyAliases,
  OrdersRoutingKeys,
} from '../../broker/event-conventions.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import { OrdersEvents } from './orders.events.js';

const ITEM_A = '507f1f77bcf86cd799439011';
const ITEM_B = '507f1f77bcf86cd799439012';

interface Harness {
  events: OrdersEvents;
  consumer: { consumeSubscriptions: ReturnType<typeof vi.fn> };
  reservationService: {
    reserve: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    consumeServedOrder: ReturnType<typeof vi.fn>;
  };
  processedEvents: {
    isProcessed: ReturnType<typeof vi.fn>;
    markProcessed: ReturnType<typeof vi.fn>;
    claim: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  wasteService: {
    registerOrderWaste: ReturnType<typeof vi.fn>;
    handleDishRejected: ReturnType<typeof vi.fn>;
  };
}

function buildHarness(): Harness {
  const consumer = {
    consumeSubscriptions: vi.fn().mockResolvedValue(undefined),
  };
  const reservationService = {
    reserve: vi.fn().mockResolvedValue({ orderId: 'O-1' }),
    confirm: vi.fn().mockResolvedValue({ orderId: 'O-1' }),
    release: vi.fn().mockResolvedValue({ orderId: 'O-1' }),
    consumeServedOrder: vi.fn().mockResolvedValue({ orderId: 'O-1' }),
  };
  const processedEvents = {
    isProcessed: vi.fn().mockResolvedValue(false),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
  };

  const wasteService = {
    registerOrderWaste: vi.fn().mockResolvedValue({ recorded: 1, skipped: 0 }),
    handleDishRejected: vi.fn().mockResolvedValue(undefined),
  };

  const events = new OrdersEvents(
    consumer as never,
    reservationService as never,
    processedEvents as never,
    {} as never,
    wasteService as never,
  );

  return { events, consumer, reservationService, processedEvents, wasteService };
}

async function getSubscriptions(harness: Harness): Promise<EventSubscriptions> {
  await harness.events.onModuleInit();
  return harness.consumer.consumeSubscriptions.mock.calls[0][0] as EventSubscriptions;
}

async function handlerFor(
  harness: Harness,
  routingKey: string,
): Promise<(payload: unknown) => Promise<void>> {
  const subscriptions = await getSubscriptions(harness);
  const matched = subscriptions.matching(routingKey);
  expect(matched).toHaveLength(ORDERS_EXCHANGES.length);
  return matched[0].handler as (payload: unknown) => Promise<void>;
}

function event(routingKey: string, payload: Record<string, unknown>) {
  return {
    eventId: `E-${routingKey}`,
    orderId: 'O-1',
    version: 1,
    occurredAt: '2026-01-01T00:00:00.000Z',
    ...payload,
  };
}

describe('OrdersEvents', () => {
  let harness: Harness;

  beforeEach(() => {
    vi.clearAllMocks();
    harness = buildHarness();
  });

  describe('onModuleInit', () => {
    it('suscribe las claves de órdenes, en inglés y en español, a la cola dedicada', async () => {
      const subscriptions = await getSubscriptions(harness);

      expect(harness.consumer.consumeSubscriptions).toHaveBeenCalledWith(
        subscriptions,
        ORDERS_EVENTS_QUEUE,
        { durable: true },
      );

      const names = Object.keys(OrdersRoutingKeys) as Array<
        keyof typeof OrdersRoutingKeys
      >;
      for (const name of names) {
        for (const routingKey of [
          OrdersRoutingKeys[name],
          ...OrdersRoutingKeyAliases[name],
        ]) {
          const matched = subscriptions.matching(routingKey);
          expect(matched.map((m) => m.exchange).sort()).toEqual(
            [...ORDERS_EXCHANGES].sort(),
          );
        }
      }
    });

    it('no propaga el error si el broker no está disponible al suscribirse', async () => {
      harness.consumer.consumeSubscriptions.mockRejectedValueOnce(
        new Error('broker caído'),
      );

      await expect(harness.events.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('order.created', () => {
    it('reserva los items y marca el evento como procesado', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderCreated);
      const payload = event(OrdersRoutingKeys.OrderCreated, {
        correlationId: 'C-1',
        items: [{ itemId: ITEM_A, quantity: 2 }],
      });

      await handler(payload);

      expect(harness.reservationService.reserve).toHaveBeenCalledWith({
        orderId: 'O-1',
        items: [{ itemId: ITEM_A, quantity: 2 }],
        eventId: payload.eventId,
        correlationId: 'C-1',
      });
      expect(harness.processedEvents.markProcessed).toHaveBeenCalledWith(
        'orders-events',
        payload.eventId,
      );
    });

    it('normaliza y filtra los items del evento', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderCreated);

      await handler(
        event(OrdersRoutingKeys.OrderCreated, {
          items: [
            { plateId: ' P-1 ', quantity: 2 },
            { itemId: ITEM_A, quantity: 1 },
            { quantity: 0 },
            null,
            'invalido',
            { plateId: '   ', itemId: '  ', quantity: 3 },
          ],
        }),
      );

      expect(harness.reservationService.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            { plateId: 'P-1', quantity: 2 },
            { itemId: ITEM_A, quantity: 1 },
          ],
        }),
      );
    });

    it.each([
      ['payload nulo', null],
      ['sin eventId', { orderId: 'O-1', items: [{ itemId: ITEM_A, quantity: 1 }] }],
      ['sin orderId', { eventId: 'E-1', items: [{ itemId: ITEM_A, quantity: 1 }] }],
      ['sin items', { eventId: 'E-1', orderId: 'O-1' }],
      ['items vacíos', { eventId: 'E-1', orderId: 'O-1', items: [] }],
      ['items no array', { eventId: 'E-1', orderId: 'O-1', items: 'x' }],
    ])('ignora el evento con %s', async (_label, payload) => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderCreated);

      await handler(payload);

      expect(harness.reservationService.reserve).not.toHaveBeenCalled();
      expect(harness.processedEvents.markProcessed).not.toHaveBeenCalled();
    });

    it('no reprocesa eventos ya vistos', async () => {
      harness.processedEvents.isProcessed.mockResolvedValueOnce(true);
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderCreated);

      await handler(
        event(OrdersRoutingKeys.OrderCreated, {
          items: [{ itemId: ITEM_A, quantity: 1 }],
        }),
      );

      expect(harness.processedEvents.isProcessed).toHaveBeenCalledWith(
        'orders-events',
        `E-${OrdersRoutingKeys.OrderCreated}`,
      );
      expect(harness.reservationService.reserve).not.toHaveBeenCalled();
      expect(harness.processedEvents.markProcessed).not.toHaveBeenCalled();
    });
  });

  describe('order.confirmed', () => {
    it('confirma la reserva y marca el evento', async () => {
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeys.OrderConfirmed,
      );
      const payload = event(OrdersRoutingKeys.OrderConfirmed, {
        correlationId: 'C-2',
      });

      await handler(payload);

      expect(harness.reservationService.confirm).toHaveBeenCalledWith(
        'O-1',
        payload.eventId,
        'C-2',
      );
      expect(harness.processedEvents.markProcessed).toHaveBeenCalledOnce();
    });

    it('ignora payloads inválidos y duplicados', async () => {
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeys.OrderConfirmed,
      );

      await handler({ orderId: 'O-1' });
      expect(harness.reservationService.confirm).not.toHaveBeenCalled();

      harness.processedEvents.isProcessed.mockResolvedValueOnce(true);
      await handler(event(OrdersRoutingKeys.OrderConfirmed, {}));
      expect(harness.reservationService.confirm).not.toHaveBeenCalled();
    });
  });

  describe('order.cancelled', () => {
    it('libera la reserva con el motivo recibido', async () => {
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeys.OrderCancelled,
      );

      await handler(
        event(OrdersRoutingKeys.OrderCancelled, { reason: 'Cliente desistió' }),
      );

      expect(harness.reservationService.release).toHaveBeenCalledWith(
        'O-1',
        undefined,
        'Cliente desistió',
        expect.objectContaining({ eventId: expect.any(String) }),
      );
      expect(harness.processedEvents.markProcessed).toHaveBeenCalledOnce();
    });

    it('usa un motivo por defecto al cancelar', async () => {
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeys.OrderCancelled,
      );

      await handler(event(OrdersRoutingKeys.OrderCancelled, {}));

      expect(harness.reservationService.release).toHaveBeenCalledWith(
        'O-1',
        undefined,
        'Orden cancelada',
        expect.objectContaining({ eventId: expect.any(String) }),
      );
    });

    it('ignora payloads inválidos y duplicados', async () => {
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeys.OrderCancelled,
      );

      await handler(null);
      expect(harness.reservationService.release).not.toHaveBeenCalled();

      harness.processedEvents.isProcessed.mockResolvedValueOnce(true);
      await handler(event(OrdersRoutingKeys.OrderCancelled, {}));
      expect(harness.reservationService.release).not.toHaveBeenCalled();
    });
  });

  describe('order.served', () => {
    it('consume la reserva por FEFO y marca el evento', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderServed);
      const payload = event(OrdersRoutingKeys.OrderServed, {
        correlationId: 'C-3',
        reason: 'Mesa 4',
        items: [
          { plateId: 'P-1', quantity: 2 },
          { itemId: ITEM_B, quantity: 1 },
        ],
      });

      await handler(payload);

      expect(
        harness.reservationService.consumeServedOrder,
      ).toHaveBeenCalledWith({
        orderId: 'O-1',
        eventId: payload.eventId,
        correlationId: 'C-3',
        items: [
          { plateId: 'P-1', quantity: 2 },
          { itemId: ITEM_B, quantity: 1 },
        ],
        reason: 'Mesa 4',
      });
      expect(harness.processedEvents.markProcessed).toHaveBeenCalledOnce();
    });

    it('relanza el error de consumo sin marcar el evento', async () => {
      harness.reservationService.consumeServedOrder.mockRejectedValueOnce(
        new Error('fallo FEFO'),
      );
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderServed);

      await expect(
        handler(event(OrdersRoutingKeys.OrderServed, {})),
      ).rejects.toThrow('fallo FEFO');
      expect(harness.processedEvents.markProcessed).not.toHaveBeenCalled();
    });

    it('ignora payloads inválidos y duplicados', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderServed);

      await handler({});
      expect(
        harness.reservationService.consumeServedOrder,
      ).not.toHaveBeenCalled();

      harness.processedEvents.isProcessed.mockResolvedValueOnce(true);
      await handler(event(OrdersRoutingKeys.OrderServed, {}));
      expect(
        harness.reservationService.consumeServedOrder,
      ).not.toHaveBeenCalled();
    });
  });

  describe('parseEvent', () => {
    it('aplica valores por defecto al envelope', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderConfirmed);

      await handler({
        eventId: ' E-1 ',
        orderId: ' O-1 ',
        correlationId: ' C-1 ',
        items: [],
      });

      expect(harness.reservationService.confirm).toHaveBeenCalledWith(
        'O-1',
        'E-1',
        'C-1',
      );
    });
  });

  describe('claves en español y platillos con sourceId', () => {
    it('procesa la orden creada con la clave en español y lee sourceId/offerId', async () => {
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeyAliases.OrderCreated[0],
      );

      await handler(
        event('creada', {
          items: [
            { offerId: 'offer-1', sourceId: 'plate-1', quantity: 2 },
            { offerId: 'offer-2', plateId: 'plate-2', quantity: 1 },
          ],
        }),
      );

      expect(harness.reservationService.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'O-1',
          items: [
            { plateId: 'plate-1', offerId: 'offer-1', quantity: 2 },
            { plateId: 'plate-2', offerId: 'offer-2', quantity: 1 },
          ],
        }),
      );
    });

    it('la clave en_preparacion descuenta el stock igual que order.served', async () => {
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeyAliases.OrderServed[0],
      );

      await handler(event('en_preparacion', { items: [] }));

      expect(harness.reservationService.consumeServedOrder).toHaveBeenCalled();
    });
  });

  describe('order.expired', () => {
    it('libera la reserva huérfana de la orden expirada', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderExpired);

      await handler(event('expired', { reason: 'timeout' }));

      expect(harness.reservationService.release).toHaveBeenCalledWith(
        'O-1',
        undefined,
        'timeout',
        expect.any(Object),
      );
      expect(harness.processedEvents.markProcessed).toHaveBeenCalled();
    });
  });

  describe('order.wasted', () => {
    it('registra la merma con los platillos afectados y el motivo', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderWasted);

      await handler(
        event('wasted', {
          motivo: 'Comanda anulada por el chef',
          itemsAfectados: [
            { offerId: 'offer-1', quantity: 2 },
            { offerId: 'offer-2', sourceId: 'plate-2', quantity: 1 },
          ],
        }),
      );

      expect(harness.processedEvents.claim).toHaveBeenCalledWith(
        'orders-events',
        'E-wasted',
      );
      expect(harness.wasteService.registerOrderWaste).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'O-1',
          reason: 'Comanda anulada por el chef',
          lines: [
            { offerId: 'offer-1', plateId: undefined, quantity: 2 },
            { offerId: 'offer-2', plateId: 'plate-2', quantity: 1 },
          ],
        }),
      );
    });

    it('libera el evento para reintentarlo si el registro falla', async () => {
      harness.wasteService.registerOrderWaste.mockRejectedValueOnce(
        new Error('base caída'),
      );
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderWasted);

      await expect(
        handler(
          event('wasted', { itemsAfectados: [{ offerId: 'o', quantity: 1 }] }),
        ),
      ).rejects.toThrow('base caída');
      expect(harness.processedEvents.release).toHaveBeenCalledWith(
        'orders-events',
        'E-wasted',
      );
    });

    it('ignora un evento sin platillos afectados', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.OrderWasted);

      await handler(event('wasted', { itemsAfectados: [] }));

      expect(harness.wasteService.registerOrderWaste).not.toHaveBeenCalled();
    });

    it('no vuelve a registrar un evento ya reclamado por otra copia', async () => {
      harness.processedEvents.claim.mockResolvedValue(false);
      const handler = await handlerFor(
        harness,
        OrdersRoutingKeyAliases.OrderWasted[0],
      );

      await handler(
        event('wasted', { itemsAfectados: [{ offerId: 'o', quantity: 1 }] }),
      );

      expect(harness.wasteService.registerOrderWaste).not.toHaveBeenCalled();
    });
  });

  describe('dish.rejected', () => {
    it('entrega el platillo rechazado para liberar su reserva', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.DishRejected);

      await handler(
        event('dish', {
          itemId: 'line-1',
          offerId: 'offer-1',
          sourceId: 'plate-1',
          quantity: 1,
          reason: 'Carne en mal estado',
        }),
      );

      expect(harness.wasteService.handleDishRejected).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'O-1',
          offerId: 'offer-1',
          plateId: 'plate-1',
          quantity: 1,
          reason: 'Carne en mal estado',
        }),
      );
    });

    it('ignora un rechazo sin cantidad válida', async () => {
      const handler = await handlerFor(harness, OrdersRoutingKeys.DishRejected);

      await handler(event('dish', { offerId: 'o', quantity: 0 }));

      expect(harness.wasteService.handleDishRejected).not.toHaveBeenCalled();
    });
  });
});
