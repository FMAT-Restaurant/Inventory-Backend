import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import { BatchEvents } from './batch.events.js';

describe('BatchEvents', () => {
  let events: BatchEvents;
  const consumeSubscriptions = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    consumeSubscriptions.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchEvents,
        {
          provide: EventConsumer,
          useValue: { consumeSubscriptions },
        },
      ],
    }).compile();
    events = module.get<BatchEvents>(BatchEvents);
  });

  it('escucha creación y eliminación de platillos en su propia cola', async () => {
    await events.onModuleInit();
    const [subscriptions, queue] = consumeSubscriptions.mock.calls[0] as [
      EventSubscriptions,
      string,
    ];

    expect(queue).toBe('cola_batch_events');
    expect(
      subscriptions.all.map(({ exchange, routingKey }) => [
        exchange,
        routingKey,
      ]),
    ).toEqual([
      ['menu.topic', 'menu.plate.created'],
      ['menu.topic', 'menu.plate.deleted'],
    ]);
    for (const { handler } of subscriptions.all) {
      expect(handler({ plateId: 'P-1' })).toBeUndefined();
    }
  });

  it('no bloquea el arranque cuando falla la suscripción', async () => {
    consumeSubscriptions.mockRejectedValueOnce(new Error('Broker caído'));
    await expect(events.onModuleInit()).resolves.toBeUndefined();
  });
});
