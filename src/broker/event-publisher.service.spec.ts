import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { EventPublisher } from './event-publisher.service.js';

vi.mock('amqplib', () => ({ connect: vi.fn() }));

describe('EventPublisher', () => {
  let publisher: EventPublisher;
  const originalRabbitEnabled = process.env.RABBITMQ_ENABLED;
  const channel = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn(),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const connection = {
    createChannel: vi.fn().mockResolvedValue(channel),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(amqp.connect).mockResolvedValue(connection as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventPublisher],
    }).compile();
    publisher = module.get<EventPublisher>(EventPublisher);
  });

  afterEach(() => {
    if (originalRabbitEnabled === undefined) {
      delete process.env.RABBITMQ_ENABLED;
    } else {
      process.env.RABBITMQ_ENABLED = originalRabbitEnabled;
    }
    vi.useRealTimers();
  });

  it('publica el evento como JSON en el exchange y routing key indicados', async () => {
    await publisher.onModuleInit();
    const payload = { plateId: 'P-1', isAvailable: true };

    await publisher.publish(
      'inventory.topic',
      'inventory.recipe.availability-changed',
      payload,
    );

    expect(channel.assertExchange).toHaveBeenCalledWith(
      'inventory.topic',
      'topic',
      { durable: true },
    );
    expect(channel.publish).toHaveBeenCalledWith(
      'inventory.topic',
      'inventory.recipe.availability-changed',
      Buffer.from(JSON.stringify(payload)),
    );
  });

  it('reintenta conectar al publicar si el broker estaba caído', async () => {
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('Broker caído'));
    await publisher.onModuleInit();

    await publisher.publish('inventory.topic', 'inventory.recipe.changed', {});

    expect(amqp.connect).toHaveBeenCalledTimes(2);
    expect(channel.publish).toHaveBeenCalledWith(
      'inventory.topic',
      'inventory.recipe.changed',
      Buffer.from(JSON.stringify({})),
    );
    await publisher.onModuleDestroy();
  });

  it('no publica si no puede declarar el exchange', async () => {
    await publisher.onModuleInit();
    channel.assertExchange.mockRejectedValueOnce(
      new Error('Exchange inválido'),
    );

    await expect(
      publisher.publish('inventory.topic', 'inventory.recipe.changed', {}),
    ).rejects.toThrow('Exchange inválido');
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('cierra canal y conexión al detener el módulo', async () => {
    await publisher.onModuleInit();
    await publisher.onModuleDestroy();

    expect(channel.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it('omite la conexión cuando RabbitMQ está deshabilitado', async () => {
    process.env.RABBITMQ_ENABLED = 'false';

    await publisher.onModuleInit();

    expect(amqp.connect).not.toHaveBeenCalled();
    await expect(
      publisher.publish('inventory.topic', 'inventory.recipe.changed', {}),
    ).rejects.toThrow('no está inicializado');
    await publisher.onModuleDestroy();
  });

  it('lanza error al publicar si la reconexión falla', async () => {
    vi.useFakeTimers();
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('broker caído'));
    await publisher.onModuleInit();
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('sigue caído'));

    await expect(
      publisher.publish('inventory.topic', 'inventory.recipe.changed', {}),
    ).rejects.toThrow('no está inicializado');
    expect(amqp.connect).toHaveBeenCalledTimes(2);

    await publisher.onModuleDestroy();
  });

  it('reconecta cuando el canal se cierra inesperadamente', async () => {
    vi.useFakeTimers();
    await publisher.onModuleInit();

    const closeHandler = channel.on.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1] as (() => void) | undefined;
    expect(closeHandler).toBeTypeOf('function');

    closeHandler?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(amqp.connect).toHaveBeenCalledTimes(2);
    await publisher.onModuleDestroy();
  });

  it('cancela el reintento pendiente al detener el módulo', async () => {
    vi.useFakeTimers();
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('broker caído'));
    await publisher.onModuleInit();

    await publisher.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5000);

    expect(amqp.connect).toHaveBeenCalledTimes(1);
  });
});
