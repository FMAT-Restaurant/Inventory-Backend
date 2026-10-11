import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { EventSubscriptions } from './event-subscriptions.js';

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private initPromise: Promise<void> | null = null;
  private subscriptionsRegistry: EventSubscriptions | null = null;
  private brokerUrl: string;

  async onModuleInit() {
    this.initPromise = this.connect();
    await this.initPromise;
  }

  private async connect() {
    try {
      this.brokerUrl =
        process.env.RABBITMQ_URL ||
        'amqp://admin:supersecurepassword@host.docker.internal:5672';

      this.logger.log(
        `🔄 Conectando Consumer a RabbitMQ en: ${this.brokerUrl}`,
      );
      this.connection = await amqp.connect(this.brokerUrl);
      this.channel = await this.connection.createChannel();

      this.logger.log(
        '✅ EventConsumer conectado y canal creado exitosamente.',
      );
    } catch (error) {
      this.logger.error(
        '❌ Error al conectar el EventConsumer con RabbitMQ:',
        error,
      );
    }
  }

  async consume(
    exchange: string,
    routingKey: string,
    onMessageReceived: (payload: any, routingKey: string) => void,
  ): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }

    if (!this.channel) {
      throw new Error(
        'El canal de RabbitMQ no está inicializado en el Consumer.',
      );
    }

    // 1. Aseguramos el Exchange
    await this.channel.assertExchange(exchange, 'topic', { durable: true });

    // 2. Usamos una cola fija para que puedas verla en el panel web
    const queueName = 'cola_prueba_microservicio';
    await this.channel.assertQueue(queueName, { durable: false });

    // 3. Vinculamos la cola al exchange con la routing key
    await this.channel.bindQueue(queueName, exchange, routingKey);

    this.logger.log(
      `📥 [Consume] Escuchando cola '${queueName}' en exchange '${exchange}' con routing key '${routingKey}'...`,
    );

    // 4. Empezamos a consumir los mensajes
    this.channel.consume(
      queueName,
      (msg) => {
        if (msg && msg.content) {
          let content: any;
          try {
            content = JSON.parse(msg.content.toString());
          } catch {
            content = msg.content.toString();
          }

          this.logger.log(
            `🎯 [Mensaje Capturado Bruto] De routing key: ${msg.fields.routingKey}`,
          );

          onMessageReceived(content, msg.fields.routingKey);

          // Confirmamos que procesamos el mensaje
          this.channel?.ack(msg);
        }
      },
      { noAck: false },
    );
  }

  /**
   * Suscribe el customer a todos los eventos declarados en `subscriptions`
   * usando una sola cola. Cada mensaje se enruta al handler que coincida
   * con su routing key (matching topic con '*' y '#').
   */
  async consumeSubscriptions(
    subscriptions: EventSubscriptions,
    queueName = 'cola_customer',
  ): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }

    if (!this.channel) {
      throw new Error(
        'El canal de RabbitMQ no está inicializado en el Consumer.',
      );
    }

    // 1. Guardamos el registro y aseguramos la cola del customer
    // (una sola cola para todas sus suscripciones)
    this.subscriptionsRegistry = subscriptions;
    await this.channel.assertQueue(queueName, { durable: false });

    // 2. Vinculamos la cola a cada exchange + patrón de routing key de interés
    for (const { exchange, routingKey } of subscriptions.all) {
      await this.channel.assertExchange(exchange, 'topic', { durable: true });
      await this.channel.bindQueue(queueName, exchange, routingKey);

      this.logger.log(
        `📥 [Subscribe] Cola '${queueName}' vinculada a '${exchange}' con patrón '${routingKey}'`,
      );
    }

    // 3. Un solo consumidor que enruta cada mensaje a su handler
    this.channel.consume(
      queueName,
      (msg) => {
        if (!msg || !msg.content) {
          return;
        }

        const routingKey = msg.fields.routingKey;
        let content: any;
        try {
          content = JSON.parse(msg.content.toString());
        } catch {
          content = msg.content.toString();
        }

        this.logger.log(
          `🎯 [Mensaje Capturado] Routing key: '${routingKey}' -> cola '${queueName}'`,
        );

        void this.dispatch(content, routingKey, msg);
      },
      { noAck: false },
    );
  }

  private async dispatch(
    payload: any,
    routingKey: string,
    msg: amqp.ConsumeMessage,
  ): Promise<void> {
    const matched = this.subscriptionsRegistry?.matching(routingKey) ?? [];

    if (matched.length === 0) {
      this.logger.warn(
        `⚠️ Sin handler para routing key '${routingKey}'. Mensaje descartado.`,
      );
      this.channel?.ack(msg);
      return;
    }

    try {
      for (const { handler } of matched) {
        await handler(payload);
      }
      // Confirmamos que procesamos el mensaje
      this.channel?.ack(msg);
    } catch (error) {
      this.logger.error(
        `❌ Error al manejar el mensaje con routing key '${routingKey}':`,
        error,
      );
      // Rechazamos sin re-encolar para evitar bucles infinitos
      this.channel?.nack(msg, false, false);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
    this.logger.log('🔌 Conexión de EventConsumer cerrada.');
  }
}
