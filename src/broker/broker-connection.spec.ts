import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import {
  DEFAULT_BROKER_URL,
  attachBrokerListeners,
  closeBrokerConnection,
  openBrokerConnection,
  resolveBrokerUrl,
  type BrokerLogger,
} from './broker-connection.js';

vi.mock('amqplib', () => ({
  connect: vi.fn(),
}));

const connectMock = vi.mocked(amqp.connect);

function createLogger(): BrokerLogger {
  return { error: vi.fn(), warn: vi.fn() };
}

function asBrokerEmitter<T>(emitter: EventEmitter): T {
  return emitter as unknown as T;
}

describe('broker-connection', () => {
  const originalUrl = process.env.RABBITMQ_URL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.RABBITMQ_URL;
    } else {
      process.env.RABBITMQ_URL = originalUrl;
    }
  });

  describe('resolveBrokerUrl', () => {
    it('debería usar RABBITMQ_URL cuando está definida', () => {
      process.env.RABBITMQ_URL = 'amqp://broker:5672';

      expect(resolveBrokerUrl()).toBe('amqp://broker:5672');
    });

    it('debería usar la URL por defecto cuando no hay variable de entorno', () => {
      delete process.env.RABBITMQ_URL;

      expect(resolveBrokerUrl()).toBe(DEFAULT_BROKER_URL);
    });
  });

  describe('openBrokerConnection', () => {
    it('debería abrir la conexión y crear el canal', async () => {
      const channel = {} as Channel;
      const connection = {
        createChannel: vi.fn().mockResolvedValue(channel),
      } as unknown as ChannelModel;
      connectMock.mockResolvedValue(connection);

      const result = await openBrokerConnection('amqp://custom:5672');

      expect(connectMock).toHaveBeenCalledWith('amqp://custom:5672');
      expect(connection.createChannel).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ connection, channel });
    });

    it('debería resolver la URL por defecto si no se recibe una', async () => {
      process.env.RABBITMQ_URL = 'amqp://env:5672';
      const connection = {
        createChannel: vi.fn().mockResolvedValue({} as Channel),
      } as unknown as ChannelModel;
      connectMock.mockResolvedValue(connection);

      await openBrokerConnection();

      expect(connectMock).toHaveBeenCalledWith('amqp://env:5672');
    });
  });

  describe('closeBrokerConnection', () => {
    it('debería cerrar el canal y la conexión', async () => {
      const channel = { close: vi.fn().mockResolvedValue(undefined) };
      const connection = { close: vi.fn().mockResolvedValue(undefined) };

      await closeBrokerConnection(
        channel as unknown as Channel,
        connection as unknown as ChannelModel,
      );

      expect(channel.close).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('no debería fallar si todavía no hay conexión ni canal', async () => {
      await expect(closeBrokerConnection(null, null)).resolves.toBeUndefined();
    });
  });

  describe('attachBrokerListeners', () => {
    it('debería registrar listeners de error y cierre en conexión y canal', () => {
      const connection = new EventEmitter();
      const channel = new EventEmitter();
      const logger = createLogger();

      attachBrokerListeners(
        'Consumer',
        logger,
        asBrokerEmitter<ChannelModel>(connection),
        asBrokerEmitter<Channel>(channel),
        vi.fn(),
      );

      expect(connection.listenerCount('error')).toBe(1);
      expect(connection.listenerCount('close')).toBe(1);
      expect(channel.listenerCount('error')).toBe(1);
      expect(channel.listenerCount('close')).toBe(1);
    });

    it('debería loguear los errores sin relanzarlos', () => {
      const connection = new EventEmitter();
      const channel = new EventEmitter();
      const logger = createLogger();
      const onDisconnected = vi.fn();

      attachBrokerListeners(
        'Publisher',
        logger,
        asBrokerEmitter<ChannelModel>(connection),
        asBrokerEmitter<Channel>(channel),
        onDisconnected,
      );

      const connectionError = new Error('conexión caída');
      const channelError = new Error('canal caído');

      expect(() => connection.emit('error', connectionError)).not.toThrow();
      expect(() => channel.emit('error', channelError)).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        '❌ Error en la conexión de RabbitMQ (Publisher):',
        connectionError,
      );
      expect(logger.error).toHaveBeenCalledWith(
        '❌ Error en el canal de RabbitMQ (Publisher):',
        channelError,
      );
      expect(onDisconnected).not.toHaveBeenCalled();
    });

    it('debería notificar el cierre de la conexión y del canal', () => {
      const connection = new EventEmitter();
      const channel = new EventEmitter();
      const logger = createLogger();
      const onDisconnected = vi.fn();

      attachBrokerListeners(
        'Consumer',
        logger,
        asBrokerEmitter<ChannelModel>(connection),
        asBrokerEmitter<Channel>(channel),
        onDisconnected,
      );

      connection.emit('close');
      channel.emit('close');

      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Conexión de RabbitMQ cerrada (Consumer).',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Canal de RabbitMQ cerrado (Consumer).',
      );
      expect(onDisconnected).toHaveBeenCalledTimes(2);
    });

    it('debería tolerar una conexión o un canal nulos', () => {
      const logger = createLogger();

      expect(() =>
        attachBrokerListeners('Publisher', logger, null, null, vi.fn()),
      ).not.toThrow();
    });
  });
});
