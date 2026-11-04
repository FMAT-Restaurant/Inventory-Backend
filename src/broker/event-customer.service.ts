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

export interface ConsumeQueueOptions {
  durable?: boolean;
}

const MIN_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private initPromise: Promise<void> | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  // Un registro de suscripciones por cola (una cola por dominio suscriptor)
  private readonly registries = new Map<string, EventSubscriptions>();
  private readonly queueOptions = new Map<string, ConsumeQueueOptions>();
  // Colas que ya tienen su consumidor activo (evita consumidores competidores)
  private readonly consumingQueues = new Set<string>();
  private brokerUrl: string;

  async onModuleInit() {
    this.stopped = false;
    this.initPromise = this.connect();
    await this.initPromise;
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
          'RabbitMQ deshabilitado (RABBITMQ_ENABLED=false), omitiendo EventConsumer.',
        );
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
        () => this.handleDisconnect(),
      );

      this.reconnectAttempt = 0;
      await this.restoreSubscriptions();

      this.logger.log(
        '✅ EventConsumer conectado y canal creado exitosamente.',
      );
    } catch (error) {
      this.logger.warn(
        '⚠️ No se pudo conectar EventConsumer con RabbitMQ, continuando sin broker:',
        (error as Error)?.message,
      );
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(): void {
    this.channel = null;
    this.connection = null;
    this.consumingQueues.clear();
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
    // No mantener vivo el proceso por un reintento pendiente.
    this.reconnectTimer.unref?.();
  }

  private async restoreSubscriptions(): Promise<void> {
    for (const [queueName, registry] of this.registries) {
      await this.bindQueue(queueName, registry);
      await this.startConsumer(queueName);
    }
  }

  private async bindQueue(
    queueName: string,
    registry: EventSubscriptions,
    keysToSkip: Set<string> = new Set<string>(),
  ): Promise<void> {
    if (!this.channel) {
      return;
    }

    const options = this.queueOptions.get(queueName) ?? { durable: false };
    await this.channel.assertQueue(queueName, {
      durable: options.durable ?? false,
    });

    for (const { exchange, routingKey } of registry.all) {
      const key = `${exchange}::${routingKey}`;
      if (keysToSkip.has(key)) {
        continue;
      }

      await this.channel.assertExchange(exchange, 'topic', { durable: true });
      await this.channel.bindQueue(queueName, exchange, routingKey);
      this.logger.log(
        `📥 [Subscribe] Cola '${queueName}' vinculada a '${exchange}' con patrón '${routingKey}'`,
      );
    }
  }

  private async startConsumer(queueName: string): Promise<void> {
    if (!this.channel || this.consumingQueues.has(queueName)) {
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
        this.logger.error(
          `❌ No se pudo iniciar el consumo de la cola '${queueName}':`,
          error,
        );
      });
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
    options: ConsumeQueueOptions = {},
  ): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }

    // Registro previo de esta cola (si ya existe, combinamos). El registro se
    // conserva aunque el broker esté caído para re-suscribirse al reconectar.
    const registry =
      this.registries.get(queueName) ?? new EventSubscriptions();
    const existingKeys = new Set(
      registry.all.map((s) => `${s.exchange}::${s.routingKey}`),
    );
    registry.merge(subscriptions);
    this.registries.set(queueName, registry);
    this.queueOptions.set(queueName, {
      durable: options.durable ?? false,
    });

    if (!this.channel) {
      this.logger.warn(
        `⚠️ Broker no disponible; la cola '${queueName}' quedará registrada para reconectar.`,
      );
      this.scheduleReconnect();
      return;
    }

    try {
      await this.bindQueue(queueName, subscriptions, existingKeys);
      await this.startConsumer(queueName);
    } catch (error) {
      this.logger.error(
        `❌ No se pudo suscribir la cola '${queueName}':`,
        error,
      );
      this.handleDisconnect();
    }
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
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await closeBrokerConnection(this.channel, this.connection);
    this.logger.log('🔌 Conexión de EventConsumer cerrada.');
  }
}
