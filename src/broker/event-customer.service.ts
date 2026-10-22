import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { EventSubscriptions } from './event-subscriptions.js';
import {
  attachBrokerListeners,
  closeBrokerConnection,
  openBrokerConnection,
  resolveBrokerUrl,
} from './broker-connection.js';

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private initPromise: Promise<void> | null = null;
  // Un registro de suscripciones por cola (una cola por dominio suscriptor)
  private readonly registries = new Map<string, EventSubscriptions>();
  // Colas que ya tienen su consumidor activo (evita consumidores competidores)
  private readonly consumingQueues = new Set<string>();
  private brokerUrl: string;

  async onModuleInit() {
    this.initPromise = this.connect();
    await this.initPromise;
  }

  private async connect() {
    try {
      if (process.env.RABBITMQ_ENABLED === 'false') {
        this.logger.warn('RabbitMQ deshabilitado (RABBITMQ_ENABLED=false), omitiendo EventConsumer.');
        return;
      }
      this.brokerUrl = resolveBrokerUrl();

      this.logger.log(
        `🔄 Conectando Consumer a RabbitMQ en: ${this.brokerUrl}`,
      );
      const { connection, channel } = await openBrokerConnection(
        this.brokerUrl,
      );
      this.connection = connection;
      this.channel = channel;
      attachBrokerListeners(
        'Consumer',
        this.logger,
        connection,
        channel,
        () => {
          this.channel = null;
        },
      );

      this.logger.log(
        '✅ EventConsumer conectado y canal creado exitosamente.',
      );
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo conectar EventConsumer con RabbitMQ, continuando sin broker:',
        (error as Error)?.message,
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
    this.channel
      .consume(
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
      )
      .catch((error) => {
        // Si el canal se cae mientras espera la respuesta, amqplib rechaza la
        // promesa y, sin este catch, se reporta como unhandled rejection.
        this.logger.error(
          '❌ No se pudo iniciar el consumo de la cola:',
          error,
        );
      });
  }

  /**
   * Suscribe el customer a todos los eventos declarados en `subscriptions`
   * usando la cola indicada. Cada mensaje se enruta al handler que coincida
   * con su routing key (matching topic con '*' y '#').
   *
   * Se puede llamar varias veces: cada dominio usa su propia cola y todas
   * conviven sin pisarse.
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

    // 1. Aseguramos la cola del dominio
    await this.channel.assertQueue(queueName, { durable: false });

    // 2. Registro previo de esta cola (si ya existe, combinamos)
    const registry =
      this.registries.get(queueName) ?? new EventSubscriptions();
    const existingKeys = new Set(
      registry.all.map((s) => `${s.exchange}::${s.routingKey}`),
    );

    // 3. Vinculamos la cola a cada exchange + patrón de routing key nuevo
    for (const { exchange, routingKey } of subscriptions.all) {
      await this.channel.assertExchange(exchange, 'topic', { durable: true });

      const key = `${exchange}::${routingKey}`;
      if (!existingKeys.has(key)) {
        await this.channel.bindQueue(queueName, exchange, routingKey);
        this.logger.log(
          `📥 [Subscribe] Cola '${queueName}' vinculada a '${exchange}' con patrón '${routingKey}'`,
        );
      }
    }

    // 4. Actualizamos el registro de suscripciones de la cola
    registry.merge(subscriptions);
    this.registries.set(queueName, registry);

    // 5. Un solo consumidor por cola (si ya estaba consumiéndose, no repetimos)
    if (this.consumingQueues.has(queueName)) {
      this.logger.log(
        `🔁 [Subscribe] Cola '${queueName}' ya estaba siendo consumida; solo se actualizaron sus suscripciones.`,
      );
      return;
    }

    this.consumingQueues.add(queueName);
    this.channel
      .consume(
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

          void this.dispatch(queueName, content, routingKey, msg);
        },
        { noAck: false },
      )
      .catch((error) => {
        // Si el canal se cae mientras espera la respuesta, amqplib rechaza la
        // promesa y, sin este catch, se reporta como unhandled rejection.
        this.logger.error(
          `❌ No se pudo iniciar el consumo de la cola '${queueName}':`,
          error,
        );
      });
  }

  private async dispatch(
    queueName: string,
    payload: any,
    routingKey: string,
    msg: amqp.ConsumeMessage,
  ): Promise<void> {
    const matched = this.registries.get(queueName)?.matching(routingKey) ?? [];

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
    await closeBrokerConnection(this.channel, this.connection);
    this.logger.log('🔌 Conexión de EventConsumer cerrada.');
  }
}
