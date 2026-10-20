import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import {
  MENU_EXCHANGE,
  MenuRoutingKeys,
  PlateEvent,
  RECIPE_EVENTS_QUEUE,
} from '../../broker/event-conventions.js';
import { RecipeService } from './recipe.service.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';

// Escucha los eventos del microservicio de menú.
@Injectable()
export class RecipeEvents implements OnModuleInit {
  private readonly logger = new Logger(RecipeEvents.name);

  constructor(
    private readonly consumer: EventConsumer,
    private readonly recipeService: RecipeService,
  ) {}

  async onModuleInit(): Promise<void> {
    const subscriptions = new EventSubscriptions()
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateCreated, (payload) =>
        this.handlePlateCreated(payload),
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

  // Al crearse un platillo, registramos (o actualizamos) su receta en inventario
  private async handlePlateCreated(payload: PlateEvent): Promise<void> {
    const dto = this.toCreateRecipeDto(payload);

    if (!dto) {
      this.logger.warn(
        `⚠️ Evento '${MenuRoutingKeys.PlateCreated}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    try {
      const { recipe, isNew } =
        await this.recipeService.registerOrUpdate(dto);
      this.logger.log(
        `🍽️ Receta ${isNew ? 'registrada' : 'actualizada'} para plateId '${recipe.plateId}' desde '${MenuRoutingKeys.PlateCreated}'`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error al registrar la receta del plateId '${dto.plateId}':`,
        error,
      );
    }
  }

  // Construye el CreateRecipeDto a partir del payload del evento del menú
  private toCreateRecipeDto(payload: PlateEvent): CreateRecipeDto | null {
    const items = payload?.items;
    if (
      !payload?.plateId ||
      !payload?.name ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return null;
    }

    const dto = new CreateRecipeDto();
    dto.plateId = payload.plateId;
    dto.name = payload.name;
    dto.items = items.map((item) => ({
      ingredientId: item.ingredientId,
      requiredQuantity: item.requiredQuantity,
    }));

    return dto;
  }

  private logEvent(routingKey: string, payload: unknown): void {
    this.logger.log(
      `📨 [Menu] Evento '${routingKey}' recibido: ${JSON.stringify(payload)}`,
    );
  }
}
