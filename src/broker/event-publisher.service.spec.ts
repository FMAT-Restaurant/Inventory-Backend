import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { EventPublisher } from './event-publisher.service.js';

vi.mock('amqplib', () => ({ connect: vi.fn() }));

describe('EventPublisher', () => {
  let publisher: EventPublisher;
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

  it('rechaza la publicación si el broker no creó un canal', async () => {
    vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('Broker caído'));
    await publisher.onModuleInit();

    await expect(
      publisher.publish('inventory.topic', 'inventory.recipe.changed', {}),
    ).rejects.toThrow('El canal de RabbitMQ no está inicializado');
    await publisher.onModuleDestroy();
    expect(channel.close).not.toHaveBeenCalled();
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
});
