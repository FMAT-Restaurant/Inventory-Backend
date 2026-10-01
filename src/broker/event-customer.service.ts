import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private initPromise: Promise<void> | null = null;
  private brokerUrl: string;

  async onModuleInit() {
    this.initPromise = this.connect();
    await this.initPromise;
  }

  private async connect() {
    try {
      this.brokerUrl =
        process.env.RABBITMQ_URL ||
        'amqps://tsaxufiv:a62atRXSN8YhT_zeLLKxYtqmoDT8C1Eo@gull.rmq.cloudamqp.com/tsaxufiv';

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
    onMessageReceived: (payload: any) => void,
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
    await this.channel.assertExchange(exchange, 'topic', { durable: false });

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

          onMessageReceived(content);

          // Confirmamos que procesamos el mensaje
          this.channel?.ack(msg);
        }
      },
      { noAck: false },
    );
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
    this.logger.log('🔌 Conexión de EventConsumer cerrada.');
  }
}
