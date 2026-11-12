import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
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
        this.handlePlateUpdated(payload),
      )
      .on(MENU_EXCHANGE, MenuRoutingKeys.PlateDeleted, (payload) =>
        this.handlePlateDeleted(payload),
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
      const { recipe, isNew } = await this.recipeService.registerOrUpdate(dto, {
        allowMissingItems: true,
      });
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

  // Al editarse un platillo, sincronizamos su receta (upsert idempotente)
  private async handlePlateUpdated(payload: PlateEvent): Promise<void> {
    this.logger.log(
      `📨 [Menu] '${MenuRoutingKeys.PlateUpdated}' recibido: ${JSON.stringify(payload)}`,
    );

    const reasons = this.describeInvalidPayload(payload);
    const dto = reasons.length === 0 ? this.toCreateRecipeDto(payload) : null;

    if (!dto) {
      this.logger.warn(
        `⚠️ '${MenuRoutingKeys.PlateUpdated}' RECHAZADO, se ignora. Motivo(s): ${reasons.join('; ')}`,
      );
      return;
    }

    try {
      const { isNew } = await this.recipeService.registerOrUpdate(dto, {
        allowMissingItems: true,
      });
      this.logger.log(
        `✏️ Receta '${dto.plateId}' ${isNew ? 'no existía y se creó' : 'actualizada'} desde '${MenuRoutingKeys.PlateUpdated}'`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Error al procesar '${MenuRoutingKeys.PlateUpdated}' de la receta '${dto.plateId}': ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // Lista los motivos por los que un payload de menú no es válido
  private describeInvalidPayload(payload: PlateEvent): string[] {
    const reasons: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return ['el payload no es un objeto JSON'];
    }
    if (!payload.sourceId) reasons.push("falta 'sourceId'");
    if (!payload.name) reasons.push("falta 'name'");

    const items = payload.items;
    if (!Array.isArray(items) || items.length === 0) {
      reasons.push("'items' debe ser un arreglo con al menos 1 elemento");
    } else {
      items.forEach((item, index) => {
        if (!item?.id) reasons.push(`items[${index}] sin 'id'`);
        if (!(Number(item?.quantity) > 0)) {
          reasons.push(`items[${index}] con 'quantity' inválida`);
        }
      });
    }

    return reasons;
  }

  // Al eliminarse un platillo, eliminamos su receta (idempotente)
  private async handlePlateDeleted(payload: {
    sourceId?: string;
  }): Promise<void> {
    const sourceId = payload?.sourceId;

    if (!sourceId) {
      this.logger.warn(
        `⚠️ Evento '${MenuRoutingKeys.PlateDeleted}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    try {
      await this.recipeService.remove(sourceId);
      this.logger.log(
        `🗑️ Receta eliminada para '${sourceId}' desde '${MenuRoutingKeys.PlateDeleted}'`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`⚠️ La receta '${sourceId}' no existe. Se ignora`);
        return;
      }
      this.logger.error(`❌ Error al eliminar la receta '${sourceId}':`, error);
    }
  }

  // Construye el CreateRecipeDto a partir del payload del evento del menú
  private toCreateRecipeDto(payload: PlateEvent): CreateRecipeDto | null {
    const items = payload?.items;
    if (
      !payload?.sourceId ||
      !payload?.name ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return null;
    }

    const dto = new CreateRecipeDto();
    dto.plateId = payload.sourceId;
    dto.name = payload.name;
    dto.items = items.map((item) => ({
      itemId: item.id,
      requiredQuantity: item.quantity,
    }));

    return dto;
  }
}
