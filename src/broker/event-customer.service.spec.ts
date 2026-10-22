import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { EventConsumer } from './event-customer.service.js';
import { EventSubscriptions } from './event-subscriptions.js';

vi.mock('amqplib', () => ({ connect: vi.fn() }));

describe('EventConsumer', () => {
  let consumer: EventConsumer;
  const callbacks = new Map<string, (message: unknown) => void>();
  const channel = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn((queue: string, callback: (message: unknown) => void) => {
      callbacks.set(queue, callback);
      return Promise.resolve({ consumerTag: `test-${queue}` });
    }),
    ack: vi.fn(),
    nack: vi.fn(),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const connection = {
    createChannel: vi.fn().mockResolvedValue(channel),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  function message(routingKey: string, payload: unknown) {
    return {
      fields: { routingKey },
      content: Buffer.from(JSON.stringify(payload)),
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    callbacks.clear();
    vi.mocked(amqp.connect).mockResolvedValue(connection as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventConsumer],
    }).compile();
    consumer = module.get<EventConsumer>(EventConsumer);
  });

  it('declara exchange, cola y binding antes de consumir un evento', async () => {
    await consumer.onModuleInit();
    const handler = vi.fn();

    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.created', handler),
      'recipes',
    );

    expect(channel.assertQueue).toHaveBeenCalledWith('recipes', {
      durable: false,
    });
    expect(channel.assertExchange).toHaveBeenCalledWith('menu.topic', 'topic', {
      durable: true,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'recipes',
      'menu.topic',
      'menu.plate.created',
    );
    expect(channel.consume).toHaveBeenCalledWith(
      'recipes',
      expect.any(Function),
      {
        noAck: false,
      },
    );

    const received = message('menu.plate.created', { plateId: 'P-1' });
    callbacks.get('recipes')?.(received);
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledWith(received));
    expect(handler).toHaveBeenCalledWith({ plateId: 'P-1' });
  });

  describe('consume', () => {
    it('entrega un mensaje JSON y lo confirma en la cola de prueba', async () => {
      await consumer.onModuleInit();
      const handler = vi.fn();

      await consumer.consume('menu.topic', 'menu.plate.created', handler);

      expect(channel.assertQueue).toHaveBeenCalledWith(
        'cola_prueba_microservicio',
        { durable: false },
      );
      expect(channel.bindQueue).toHaveBeenCalledWith(
        'cola_prueba_microservicio',
        'menu.topic',
        'menu.plate.created',
      );

      const received = message('menu.plate.created', { plateId: 'P-1' });
      callbacks.get('cola_prueba_microservicio')?.(received);

      expect(handler).toHaveBeenCalledWith(
        { plateId: 'P-1' },
        'menu.plate.created',
      );
      expect(channel.ack).toHaveBeenCalledWith(received);
    });

    it('entrega texto plano cuando el contenido no es JSON', async () => {
      await consumer.onModuleInit();
      const handler = vi.fn();
      await consumer.consume('menu.topic', 'menu.plate.created', handler);

      const received = {
        fields: { routingKey: 'menu.plate.created' },
        content: Buffer.from('texto plano'),
      };
      callbacks.get('cola_prueba_microservicio')?.(received);

      expect(handler).toHaveBeenCalledWith('texto plano', 'menu.plate.created');
      expect(channel.ack).toHaveBeenCalledWith(received);
    });
  });

  it('combina suscripciones sin crear consumidores ni bindings duplicados', async () => {
    await consumer.onModuleInit();
    const created = vi.fn();
    const updated = vi.fn();

    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.created', created),
      'recipes',
    );
    await consumer.consumeSubscriptions(
      new EventSubscriptions()
        .on('menu.topic', 'menu.plate.created', vi.fn())
        .on('menu.topic', 'menu.plate.updated', updated),
      'recipes',
    );

    expect(channel.consume).toHaveBeenCalledTimes(1);
    expect(channel.bindQueue).toHaveBeenCalledTimes(2);
    const received = message('menu.plate.updated', { plateId: 'P-1' });
    callbacks.get('recipes')?.(received);
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledWith(received));
    expect(updated).toHaveBeenCalledWith({ plateId: 'P-1' });
    expect(created).not.toHaveBeenCalled();
  });

  it('mantiene aisladas las colas de distintos dominios', async () => {
    await consumer.onModuleInit();
    const recipes = vi.fn();
    const batches = vi.fn();

    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.created', recipes),
      'recipes',
    );
    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.deleted', batches),
      'batches',
    );

    const received = message('menu.plate.deleted', { plateId: 'P-1' });
    callbacks.get('batches')?.(received);
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledWith(received));
    expect(batches).toHaveBeenCalledOnce();
    expect(recipes).not.toHaveBeenCalled();
    expect(channel.consume).toHaveBeenCalledTimes(2);
  });

  it('rechaza sin reencolar cuando falla un handler', async () => {
    await consumer.onModuleInit();
    await consumer.consumeSubscriptions(
      new EventSubscriptions().on(
        'menu.topic',
        'menu.plate.created',
        async () => {
          throw new Error('Error de negocio');
        },
      ),
      'recipes',
    );

    const received = message('menu.plate.created', { plateId: 'P-1' });
    callbacks.get('recipes')?.(received);

    await vi.waitFor(() =>
      expect(channel.nack).toHaveBeenCalledWith(received, false, false),
    );
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('confirma los mensajes sin handler y entrega texto que no es JSON', async () => {
    await consumer.onModuleInit();
    const handler = vi.fn();
    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.created', handler),
      'recipes',
    );

    const textMessage = {
      fields: { routingKey: 'menu.plate.created' },
      content: Buffer.from('texto plano'),
    };
    callbacks.get('recipes')?.(textMessage);
    await vi.waitFor(() =>
      expect(channel.ack).toHaveBeenCalledWith(textMessage),
    );
    expect(handler).toHaveBeenCalledWith('texto plano');

    const unknown = message('menu.plate.deleted', { plateId: 'P-1' });
    callbacks.get('recipes')?.(unknown);
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledWith(unknown));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('informa que no hay canal si falla la conexión y permite cerrar la instancia', async () => {
    vi.mocked(amqp.connect).mockRejectedValueOnce(
      new Error('Broker no disponible'),
    );
    await consumer.onModuleInit();

    await expect(
      consumer.consumeSubscriptions(new EventSubscriptions(), 'recipes'),
    ).rejects.toThrow('El canal de RabbitMQ no está inicializado');
    await consumer.onModuleDestroy();
    expect(channel.close).not.toHaveBeenCalled();
  });

  it('cierra canal y conexión al detener el módulo', async () => {
    await consumer.onModuleInit();
    await consumer.onModuleDestroy();

    expect(channel.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
