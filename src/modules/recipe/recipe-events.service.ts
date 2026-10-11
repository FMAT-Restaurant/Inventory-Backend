import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import {
  MENU_EXCHANGE,
  MenuRoutingKeys,
  RECIPE_EVENTS_QUEUE,
} from '../../broker/event-conventions.js';

// Escucha los eventos del microservicio de menú.
// Por ahora solo registra lo recibido; la lógica de negocio se agrega después.
@Injectable()
export class RecipeEventsService implements OnModuleInit {
  private readonly logger = new Logger(RecipeEventsService.name);

  constructor(private readonly consumer: EventConsumer) {}

  async onModuleInit(): Promise<void> {
    const subscriptions = new EventSubscriptions()
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateCreated, (payload) =>
        this.logEvent(MenuRoutingKeys.PlateCreated, payload),
      )
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateUpdated, (payload) =>
        this.logEvent(MenuRoutingKeys.PlateUpdated, payload),
      )
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateDeleted, (payload) =>
        this.logEvent(MenuRoutingKeys.PlateDeleted, payload),
      );

    try {
      await this.consumer.consumeSubscriptions(
        subscriptions,
        RECIPE_EVENTS_QUEUE,
      );

      this.logger.log(
        `✅ Suscrito a los eventos del menú en exchange '${MENU_EXCHANGE}' (cola '${RECIPE_EVENTS_QUEUE}')`,
      );
    } catch (error) {
      // No bloqueamos el arranque de la app si el broker no está disponible
      this.logger.error(
        '❌ No se pudo suscribir a los eventos del menú:',
        error,
      );
    }
  }

  private logEvent(routingKey: string, payload: unknown): void {
    this.logger.log(
      `📨 [Menu] Evento '${routingKey}' recibido: ${JSON.stringify(payload)}`,
    );
  }
}
