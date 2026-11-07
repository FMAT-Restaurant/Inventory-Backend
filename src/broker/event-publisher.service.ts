import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  attachBrokerListeners,
  closeBrokerConnection,
  openBrokerConnection,
  resolveBrokerUrl,
} from './broker-connection.js';

const MIN_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

@Injectable()
export class EventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisher.name);
  // Usamos ChannelModel que es el tipo real que expone createChannel() en amqplib
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private brokerUrl: string;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = false;

  async onModuleInit() {
    this.stopped = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async doConnect(): Promise<void> {
    try {
      if (process.env.RABBITMQ_ENABLED === 'false') {
        this.logger.warn(
          'RabbitMQ deshabilitado (RABBITMQ_ENABLED=false), omitiendo EventPublisher.',
        );
        return;
      }
      this.brokerUrl = resolveBrokerUrl();
      const { connection, channel } = await openBrokerConnection(
        this.brokerUrl,
      );
      this.connection = connection;
      this.channel = channel;
      attachBrokerListeners(
        'Publisher',
        this.logger,
        connection,
        channel,
        () => this.handleDisconnect(),
      );
      this.reconnectAttempt = 0;
      this.logger.log(
        '✅ EventPublisher conectado exitosamente al broker de RabbitMQ.',
      );
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo conectar EventPublisher con RabbitMQ, continuando sin broker:',
        (error as Error)?.message,
      );
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(): void {
    this.channel = null;
    this.connection = null;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      MIN_RECONNECT_DELAY_MS * 2 ** Math.min(this.reconnectAttempt, 5),
    );
    this.reconnectAttempt += 1;

    this.logger.warn(
      `⏳ Reintentando conexión con RabbitMQ en ${delay} ms (intento ${this.reconnectAttempt}).`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async publish<T>(
    exchange: string,
    routingKey: string,
    payload: T,
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error(
        'El canal de RabbitMQ no está inicializado en el Publisher.',
      );
    }

    await this.channel.assertExchange(exchange, 'topic', { durable: true });
    const messageBuffer = Buffer.from(JSON.stringify(payload));

    this.channel.publish(exchange, routingKey, messageBuffer);
    this.logger.log(
      `📤 [Publish] Evento enviado a exchange '${exchange}' con routing key '${routingKey}':`,
      payload,
    );
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await closeBrokerConnection(this.channel, this.connection);
    this.logger.log('🔌 Conexión de EventPublisher cerrada.');
  }
}
