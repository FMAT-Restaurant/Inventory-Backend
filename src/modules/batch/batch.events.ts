import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import {
  BATCH_EVENTS_QUEUE,
  MENU_EXCHANGE,
  MenuRoutingKeys,
} from '../../broker/event-conventions.js';

// Ejemplo: escucha los eventos del menú relevantes para lotes de producción.
// La lógica de negocio real se agrega después (por ahora solo loguea).
@Injectable()
export class BatchEvents implements OnModuleInit {
  private readonly logger = new Logger(BatchEvents.name);

  constructor(private readonly consumer: EventConsumer) {}

  async onModuleInit(): Promise<void> {
    const subscriptions = new EventSubscriptions()
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateCreated, (payload) =>
        this.logger.log(
          `📨 [BatchEvents] ${MenuRoutingKeys.PlateCreated}: ${JSON.stringify(payload)}`,
        ),
      )
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateDeleted, (payload) =>
        this.logger.log(
          `📨 [BatchEvents] ${MenuRoutingKeys.PlateDeleted}: ${JSON.stringify(payload)}`,
        ),
      );

    try {
      await this.consumer.consumeSubscriptions(
        subscriptions,
        BATCH_EVENTS_QUEUE,
      );

      this.logger.log(
        `✅ BatchEvents suscrito en '${MENU_EXCHANGE}' (cola '${BATCH_EVENTS_QUEUE}')`,
      );
    } catch (error) {
      // No bloqueamos el arranque de la app si el broker no está disponible
      this.logger.error('❌ No se pudo suscribir BatchEvents:', error);
    }
  }
}
