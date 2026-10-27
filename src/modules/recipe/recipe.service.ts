import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Item } from '../item/schemas/item.schema.js';
import { ItemService } from '../item/item.service.js';
import {
  ITEM_CHANGED_EVENT,
  ItemChangeEmitter,
  ItemChangedEvent,
} from '../item/item-change.emitter.js';
import { EventPublisher } from '../../broker/event-publisher.service.js';
import {
  INVENTORY_EXCHANGE,
  InventoryRoutingKeys,
  RecipeAvailabilityChangedEvent,
} from '../../broker/event-conventions.js';
import { Recipe } from './schemas/recipe.schema.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';
import { UpdateRecipeDto } from './dto/update-recipe.dto.js';
import { QueryRecipesDto } from './dto/query-recipes.dto.js';
import {
  RecipeItemDetailResponseDto,
  RecipeResponseDto,
} from './dto/recipe-response.dto.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class RecipeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecipeService.name);

  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    private readonly itemService: ItemService,
    private readonly itemChangeEmitter: ItemChangeEmitter,
    private readonly publisher: EventPublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    // Cuando cambia un item, recalculamos y publicamos la
    // disponibilidad de las recetas que lo usan
    this.itemChangeEmitter.on(ITEM_CHANGED_EVENT, this.handleItemChanged);
  }

  onModuleDestroy(): void {
    this.itemChangeEmitter.off(ITEM_CHANGED_EVENT, this.handleItemChanged);
  }

  private readonly handleItemChanged = (event: ItemChangedEvent): void => {
    void this.publishAvailabilityForItem(event);
  };

  async registerOrUpdate(
    createDto: CreateRecipeDto,
  ): Promise<{ recipe: RecipeResponseDto; isNew: boolean }> {
    const itemMap = await this.validateAndFetchItems(
      createDto.items.map((i) => i.itemId),
    );

    let recipe = await this.recipeModel
      .findOne({ plateId: createDto.plateId })
      .exec();
    let isNew = false;

    if (recipe) {
      recipe.name = createDto.name;
      recipe.items = createDto.items.map((item) => ({
        itemId: new Types.ObjectId(item.itemId),
        requiredQuantity: item.requiredQuantity,
      })) as any;
      await recipe.save();
    } else {
      isNew = true;
      try {
        recipe = new this.recipeModel({
          plateId: createDto.plateId,
          name: createDto.name,
          items: createDto.items.map((item) => ({
            itemId: new Types.ObjectId(item.itemId),
            requiredQuantity: item.requiredQuantity,
          })),
        });
        await recipe.save();
      } catch (error) {
        if (this.isDuplicateKeyError(error)) {
          throw new ConflictException(
            `Ya existe una receta registrada con el plateId '${createDto.plateId}'`,
          );
        }
        throw error;
      }
    }

    const response = this.buildResponseDto(recipe, itemMap);
    await this.publishAvailabilityChanged(response);

    return {
      recipe: response,
      isNew,
    };
  }

  async findAll(query?: QueryRecipesDto): Promise<RecipeResponseDto[]> {
    const [recipes, allItems] = await Promise.all([
      this.recipeModel.find().exec(),
      this.itemService.findAll(),
    ]);

    const itemMap = new Map<string, Item>(
      allItems.map((item) => [(item._id as Types.ObjectId).toString(), item]),
    );

    let result = recipes.map((recipe) =>
      this.buildResponseDto(recipe, itemMap),
    );

    if (query?.available !== undefined) {
      result = result.filter((r) => r.isAvailable === query.available);
    }

    return result;
  }

  async findOne(idOrPlateId: string): Promise<RecipeResponseDto> {
    const recipe = await this.findEntityByIdOrPlateId(idOrPlateId);
    const itemIds = recipe.items.map((item) => item.itemId.toString());
    const itemMap = await this.validateAndFetchItems(itemIds, false);

    return this.buildResponseDto(recipe, itemMap);
  }

  async update(
    idOrPlateId: string,
    updateDto: UpdateRecipeDto,
  ): Promise<RecipeResponseDto> {
    const recipe = await this.findEntityByIdOrPlateId(idOrPlateId);

    if (updateDto.items && updateDto.items.length > 0) {
      await this.validateAndFetchItems(updateDto.items.map((i) => i.itemId));
      recipe.items = updateDto.items.map((item) => ({
        itemId: new Types.ObjectId(item.itemId),
        requiredQuantity: item.requiredQuantity,
      })) as any;
    }

    if (updateDto.name !== undefined) {
      recipe.name = updateDto.name;
    }

    if (
      updateDto.plateId !== undefined &&
      updateDto.plateId !== recipe.plateId
    ) {
      const existingPlate = await this.recipeModel
        .findOne({ plateId: updateDto.plateId })
        .exec();
      if (existingPlate) {
        throw new ConflictException(
          `Ya existe otra receta con el plateId '${updateDto.plateId}'`,
        );
      }
      recipe.plateId = updateDto.plateId;
    }

    await recipe.save();

    const itemIds = recipe.items.map((item) => item.itemId.toString());
    const itemMap = await this.validateAndFetchItems(itemIds, false);

    const response = this.buildResponseDto(recipe, itemMap);
    await this.publishAvailabilityChanged(response);

    return response;
  }

  async remove(idOrPlateId: string): Promise<void> {
    const recipe = await this.findEntityByIdOrPlateId(idOrPlateId);

    const result = await this.recipeModel.deleteOne({ _id: recipe._id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(
        `Receta con identificador '${idOrPlateId}' no encontrada`,
      );
    }

    // La receta ya no existe: avisamos al menú que no está disponible
    await this.publishAvailabilityChanged({
      plateId: recipe.plateId,
      name: recipe.name,
      isAvailable: false,
      maxPreparablePortions: 0,
      productionCost: 0,
    });
  }

  private async publishAvailabilityChanged(
    data: Pick<
      RecipeAvailabilityChangedEvent,
      | 'plateId'
      | 'name'
      | 'isAvailable'
      | 'maxPreparablePortions'
      | 'productionCost'
    >,
  ): Promise<void> {
    const event: RecipeAvailabilityChangedEvent = {
      ...data,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.publisher.publish(
        INVENTORY_EXCHANGE,
        InventoryRoutingKeys.RecipeAvailabilityChanged,
        event,
      );
    } catch (error) {
      // Un broker caído no debe impedir la operación de negocio
      this.logger.warn(
        `No se pudo publicar '${InventoryRoutingKeys.RecipeAvailabilityChanged}' para plateId '${data.plateId}': ${error}`,
      );
    }
  }

  private async publishAvailabilityForItem(
    event: ItemChangedEvent,
  ): Promise<void> {
    try {
      const recipes = await this.recipeModel
        .find({ 'items.itemId': new Types.ObjectId(event.itemId) })
        .exec();

      for (const recipe of recipes) {
        const itemIds = recipe.items.map((item) => item.itemId.toString());
        const itemMap = await this.validateAndFetchItems(itemIds, false);
        await this.publishAvailabilityChanged(
          this.buildResponseDto(recipe, itemMap),
        );
      }
    } catch (error) {
      this.logger.error(
        `Error al recalcular disponibilidad tras '${event.action}' del item '${event.itemId}':`,
        error,
      );
    }
  }

  private async findEntityByIdOrPlateId(idOrPlateId: string): Promise<Recipe> {
    let recipe: Recipe | null = null;
    if (isValidObjectId(idOrPlateId)) {
      recipe = await this.recipeModel.findById(idOrPlateId).exec();
    }

    if (!recipe) {
      recipe = await this.recipeModel.findOne({ plateId: idOrPlateId }).exec();
    }

    if (!recipe) {
      throw new NotFoundException(
        `Receta con identificador '${idOrPlateId}' no encontrada`,
      );
    }

    return recipe;
  }

  private async validateAndFetchItems(
    itemIds: string[],
    failOnMissing = true,
  ): Promise<Map<string, Item>> {
    const map = new Map<string, Item>();
    const uniqueIds = Array.from(new Set(itemIds));

    for (const id of uniqueIds) {
      try {
        const item = await this.itemService.findOne(id);
        map.set(id, item);
      } catch {
        if (failOnMissing) {
          throw new NotFoundException(
            `Item con id '${id}' no encontrado en el catálogo de inventario`,
          );
        }
      }
    }

    return map;
  }

  private buildResponseDto(
    recipe: Recipe,
    itemMap: Map<string, Item>,
  ): RecipeResponseDto {
    let isAvailable = recipe.items.length > 0;
    let maxPortions = recipe.items.length > 0 ? Infinity : 0;
    let productionCost = 0;

    const itemDetails: RecipeItemDetailResponseDto[] = recipe.items.map(
      (recipeItem) => {
        const itemId = recipeItem.itemId.toString();
        const item = itemMap.get(itemId);
        const itemInfo = item as unknown as
          | {
              availableStock?: number;
              totalStock?: number;
              stock?: number;
              averageCost?: number;
              cost?: number;
            }
          | undefined;
        const stock =
          itemInfo?.availableStock ??
          itemInfo?.totalStock ??
          itemInfo?.stock ??
          0;
        const cost = itemInfo?.averageCost ?? itemInfo?.cost ?? 0;
        const name = item?.name ?? 'Desconocido';
        const unit = item?.unit ?? '';
        const hasSufficient = stock >= recipeItem.requiredQuantity;

        if (!hasSufficient) {
          isAvailable = false;
        }

        const itemPortions =
          recipeItem.requiredQuantity > 0
            ? Math.floor(stock / recipeItem.requiredQuantity)
            : 0;
        if (itemPortions < maxPortions) {
          maxPortions = itemPortions;
        }

        const itemCost = recipeItem.requiredQuantity * cost;
        productionCost += itemCost;

        return {
          itemId,
          itemName: name,
          unit,
          requiredQuantity: recipeItem.requiredQuantity,
          availableStock: stock,
          hasSufficientStock: hasSufficient,
        };
      },
    );

    return {
      id: (recipe._id as Types.ObjectId).toString(),
      plateId: recipe.plateId,
      name: recipe.name,
      isAvailable,
      maxPreparablePortions: maxPortions === Infinity ? 0 : maxPortions,
      productionCost: Math.round(productionCost * 10000) / 10000,
      items: itemDetails,
      createdAt: (recipe as any).createdAt,
      updatedAt: (recipe as any).updatedAt,
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code: number }).code === DUPLICATE_KEY_ERROR_CODE
    );
  }
}
