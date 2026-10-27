import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import {
  ITEM_EVENTS_QUEUE,
  MENU_EXCHANGE,
  MenuRoutingKeys,
} from '../../broker/event-conventions.js';

// Ejemplo: escucha los eventos del menú relevantes para items.
// La lógica de negocio real se agrega después (por ahora solo loguea).
@Injectable()
export class ItemEvents implements OnModuleInit {
  private readonly logger = new Logger(ItemEvents.name);

  constructor(private readonly consumer: EventConsumer) {}

  async onModuleInit(): Promise<void> {
    const subscriptions = new EventSubscriptions()
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateCreated, (payload) =>
        this.logger.log(
          `📨 [ItemEvents] ${MenuRoutingKeys.PlateCreated}: ${JSON.stringify(payload)}`,
        ),
      )
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateUpdated, (payload) =>
        this.logger.log(
          `📨 [ItemEvents] ${MenuRoutingKeys.PlateUpdated}: ${JSON.stringify(payload)}`,
        ),
      );

    try {
      await this.consumer.consumeSubscriptions(
        subscriptions,
        ITEM_EVENTS_QUEUE,
      );

      this.logger.log(
        `✅ ItemEvents suscrito en '${MENU_EXCHANGE}' (cola '${ITEM_EVENTS_QUEUE}')`,
      );
    } catch (error) {
      // No bloqueamos el arranque de la app si el broker no está disponible
      this.logger.error('❌ No se pudo suscribir ItemEvents:', error);
    }
  }
}
