import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ORDERS_EVENTS_QUEUE,
  ORDERS_EXCHANGE,
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
  };

  const events = new OrdersEvents(
    consumer as never,
    reservationService as never,
    processedEvents as never,
    {} as never,
  );

  return { events, consumer, reservationService, processedEvents };
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
  expect(matched).toHaveLength(1);
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
    it('suscribe las cuatro routing keys de órdenes a la cola dedicada', async () => {
      const subscriptions = await getSubscriptions(harness);

      expect(harness.consumer.consumeSubscriptions).toHaveBeenCalledWith(
        subscriptions,
        ORDERS_EVENTS_QUEUE,
        { durable: true },
      );

      for (const routingKey of Object.values(OrdersRoutingKeys)) {
        const matched = subscriptions.matching(routingKey);
        expect(matched).toHaveLength(1);
        expect(matched[0].exchange).toBe(ORDERS_EXCHANGE);
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
});
