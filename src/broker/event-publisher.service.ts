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

@Injectable()
export class EventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisher.name);
  // Usamos ChannelModel que es el tipo real que expone createChannel() en amqplib
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private brokerUrl: string;

  async onModuleInit() {
    try {
      if (process.env.RABBITMQ_ENABLED === 'false') {
        this.logger.warn('RabbitMQ deshabilitado (RABBITMQ_ENABLED=false), omitiendo EventPublisher.');
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
        () => {
          this.channel = null;
        },
      );
      this.logger.log(
        '✅ EventPublisher conectado exitosamente al broker de RabbitMQ.',
      );
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo conectar EventPublisher con RabbitMQ, continuando sin broker:',
        (error as Error)?.message,
      );
    }
  }

  async publish<T>(
    exchange: string,
    routingKey: string,
    payload: T,
  ): Promise<void> {
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
    await closeBrokerConnection(this.channel, this.connection);
    this.logger.log('🔌 Conexión de EventPublisher cerrada.');
  }
}
