import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class EventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisher.name);
  // Usamos ChannelModel que es el tipo real que expone createChannel() en amqplib
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private brokerUrl: string;

  async onModuleInit() {
    try {
      this.brokerUrl =
        process.env.RABBITMQ_URL ||
        'amqp://admin:supersecurepassword@host.docker.internal:5672';
      this.connection = await amqp.connect(this.brokerUrl);
      this.channel = await this.connection.createChannel();
      this.attachBrokerListeners();
      this.logger.log(
        '✅ EventPublisher conectado exitosamente al broker de RabbitMQ.',
      );
    } catch (error) {
      this.logger.error(
        '❌ Error al conectar el EventPublisher con RabbitMQ:',
        error,
      );
    }
  }

  private attachBrokerListeners() {
    // Sin un listener de 'error', amqplib emite un error no capturado y Node
    // termina el proceso cuando el broker cierra la conexión inesperadamente.
    this.connection?.on('error', (error) => {
      this.logger.error(
        '❌ Error en la conexión de RabbitMQ (Publisher):',
        error,
      );
    });
    this.connection?.on('close', () => {
      this.logger.warn('⚠️ Conexión de RabbitMQ cerrada (Publisher).');
      this.channel = null;
    });
    this.channel?.on('error', (error) => {
      this.logger.error('❌ Error en el canal de RabbitMQ (Publisher):', error);
    });
    this.channel?.on('close', () => {
      this.logger.warn('⚠️ Canal de RabbitMQ cerrado (Publisher).');
      this.channel = null;
    });
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
    await this.channel?.close();
    await this.connection?.close();
    this.logger.log('🔌 Conexión de EventPublisher cerrada.');
  }
}
