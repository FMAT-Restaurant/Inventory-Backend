import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { EventConsumer } from './event-customer.service.js';
import { EventSubscriptions } from './event-subscriptions.js';

vi.mock('amqplib', () => ({ connect: vi.fn() }));

describe('EventConsumer', () => {
  let consumer: EventConsumer;
  const originalRabbitEnabled = process.env.RABBITMQ_ENABLED;
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

  afterEach(() => {
    if (originalRabbitEnabled === undefined) {
      delete process.env.RABBITMQ_ENABLED;
    } else {
      process.env.RABBITMQ_ENABLED = originalRabbitEnabled;
    }
    vi.useRealTimers();
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

  it('registra las suscripciones sin broker y permite cerrar la instancia', async () => {
    vi.mocked(amqp.connect).mockRejectedValueOnce(
      new Error('Broker no disponible'),
    );
    await consumer.onModuleInit();

    await expect(
      consumer.consumeSubscriptions(new EventSubscriptions(), 'recipes'),
    ).resolves.toBeUndefined();
    await consumer.onModuleDestroy();
    expect(channel.close).not.toHaveBeenCalled();
  });

  it('cierra canal y conexión al detener el módulo', async () => {
    await consumer.onModuleInit();
    await consumer.onModuleDestroy();

    expect(channel.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it('omite la conexión cuando RabbitMQ está deshabilitado', async () => {
    process.env.RABBITMQ_ENABLED = 'false';

    await consumer.onModuleInit();
    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.created', vi.fn()),
      'recipes',
    );

    expect(amqp.connect).not.toHaveBeenCalled();
    expect(channel.consume).not.toHaveBeenCalled();
    await consumer.onModuleDestroy();
  });

  it('reconecta automáticamente tras un fallo inicial', async () => {
    vi.useFakeTimers();
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('broker caído'));

    await consumer.onModuleInit();
    expect(amqp.connect).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(amqp.connect).toHaveBeenCalledTimes(2);
    expect(connection.createChannel).toHaveBeenCalled();

    await consumer.onModuleDestroy();
  });

  it('reconecta cuando la conexión se cierra inesperadamente', async () => {
    vi.useFakeTimers();
    await consumer.onModuleInit();

    const closeHandler = channel.on.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1] as (() => void) | undefined;
    expect(closeHandler).toBeTypeOf('function');

    closeHandler?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(amqp.connect).toHaveBeenCalledTimes(2);
    await consumer.onModuleDestroy();
  });

  it('registra la cola y reconecta si falla el binding', async () => {
    vi.useFakeTimers();
    await consumer.onModuleInit();
    channel.bindQueue.mockRejectedValueOnce(new Error('binding falló'));

    await expect(
      consumer.consumeSubscriptions(
        new EventSubscriptions().on(
          'menu.topic',
          'menu.plate.created',
          vi.fn(),
        ),
        'recipes',
      ),
    ).resolves.toBeUndefined();

    await consumer.onModuleDestroy();
  });

  it('lanza error al consumir sin canal disponible', async () => {
    vi.useFakeTimers();
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('broker caído'));
    await consumer.onModuleInit();

    await expect(
      consumer.consume('menu.topic', 'menu.plate.created', vi.fn()),
    ).rejects.toThrow('no está inicializado');

    await consumer.onModuleDestroy();
  });

  it('ignora mensajes sin contenido', async () => {
    await consumer.onModuleInit();
    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.created', vi.fn()),
      'recipes',
    );

    const callback = callbacks.get('recipes');
    callback?.(null);
    callback?.({ fields: { routingKey: 'menu.plate.created' } });

    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('registra el error si no puede iniciar el consumo de la cola', async () => {
    await consumer.onModuleInit();
    channel.consume.mockRejectedValueOnce(new Error('consume falló'));
    const logger = (
      consumer as unknown as {
        logger: { error: (...args: unknown[]) => void };
      }
    ).logger;
    const errorSpy = vi.spyOn(logger, 'error');

    await consumer.consumeSubscriptions(
      new EventSubscriptions().on('menu.topic', 'menu.plate.created', vi.fn()),
      'recipes',
    );

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });

  it('cancela el reintento pendiente al detener el módulo', async () => {
    vi.useFakeTimers();
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('broker caído'));
    await consumer.onModuleInit();

    await consumer.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5000);

    expect(amqp.connect).toHaveBeenCalledTimes(1);
  });
});
