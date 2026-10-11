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
import { Ingredient } from '../ingredient/schemas/ingredient.schema.js';
import { IngredientService } from '../ingredient/ingredient.service.js';
import {
  INGREDIENT_CHANGED_EVENT,
  IngredientChangeEmitter,
  IngredientChangedEvent,
} from '../ingredient/ingredient-change.emitter.js';
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
    private readonly ingredientService: IngredientService,
    private readonly ingredientChangeEmitter: IngredientChangeEmitter,
    private readonly publisher: EventPublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    // Cuando cambia un ingrediente, recalculamos y publicamos la
    // disponibilidad de las recetas que lo usan
    this.ingredientChangeEmitter.on(
      INGREDIENT_CHANGED_EVENT,
      this.handleIngredientChanged,
    );
  }

  onModuleDestroy(): void {
    this.ingredientChangeEmitter.off(
      INGREDIENT_CHANGED_EVENT,
      this.handleIngredientChanged,
    );
  }

  private readonly handleIngredientChanged = (
    event: IngredientChangedEvent,
  ): void => {
    void this.publishAvailabilityForIngredient(event);
  };

  async registerOrUpdate(
    createDto: CreateRecipeDto,
  ): Promise<{ recipe: RecipeResponseDto; isNew: boolean }> {
    const ingredientMap = await this.validateAndFetchIngredients(
      createDto.items.map((i) => i.ingredientId),
    );

    let recipe = await this.recipeModel
      .findOne({ plateId: createDto.plateId })
      .exec();
    let isNew = false;

    if (recipe) {
      recipe.name = createDto.name;
      recipe.items = createDto.items.map((item) => ({
        ingredientId: new Types.ObjectId(item.ingredientId),
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
            ingredientId: new Types.ObjectId(item.ingredientId),
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

    const response = this.buildResponseDto(recipe, ingredientMap);
    await this.publishAvailabilityChanged(response);

    return {
      recipe: response,
      isNew,
    };
  }

  async findAll(query?: QueryRecipesDto): Promise<RecipeResponseDto[]> {
    const [recipes, allIngredients] = await Promise.all([
      this.recipeModel.find().exec(),
      this.ingredientService.findAll(),
    ]);

    const ingredientMap = new Map<string, Ingredient>(
      allIngredients.map((ing) => [(ing._id as Types.ObjectId).toString(), ing]),
    );

    let result = recipes.map((recipe) =>
      this.buildResponseDto(recipe, ingredientMap),
    );

    if (query?.available !== undefined) {
      result = result.filter((r) => r.isAvailable === query.available);
    }

    return result;
  }

  async findOne(idOrPlateId: string): Promise<RecipeResponseDto> {
    const recipe = await this.findEntityByIdOrPlateId(idOrPlateId);
    const ingredientIds = recipe.items.map((item) =>
      item.ingredientId.toString(),
    );
    const ingredientMap = await this.validateAndFetchIngredients(
      ingredientIds,
      false,
    );

    return this.buildResponseDto(recipe, ingredientMap);
  }

  async update(
    idOrPlateId: string,
    updateDto: UpdateRecipeDto,
  ): Promise<RecipeResponseDto> {
    const recipe = await this.findEntityByIdOrPlateId(idOrPlateId);

    if (updateDto.items && updateDto.items.length > 0) {
      await this.validateAndFetchIngredients(
        updateDto.items.map((i) => i.ingredientId),
      );
      recipe.items = updateDto.items.map((item) => ({
        ingredientId: new Types.ObjectId(item.ingredientId),
        requiredQuantity: item.requiredQuantity,
      })) as any;
    }

    if (updateDto.name !== undefined) {
      recipe.name = updateDto.name;
    }

    if (updateDto.plateId !== undefined && updateDto.plateId !== recipe.plateId) {
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

    const ingredientIds = recipe.items.map((item) =>
      item.ingredientId.toString(),
    );
    const ingredientMap = await this.validateAndFetchIngredients(
      ingredientIds,
      false,
    );

    const response = this.buildResponseDto(recipe, ingredientMap);
    await this.publishAvailabilityChanged(response);

    return response;
  }

  async remove(idOrPlateId: string): Promise<void> {
    const recipe = await this.findEntityByIdOrPlateId(idOrPlateId);

    const result = await this.recipeModel
      .deleteOne({ _id: recipe._id })
      .exec();
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
      'plateId' | 'name' | 'isAvailable' | 'maxPreparablePortions' | 'productionCost'
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

  private async publishAvailabilityForIngredient(
    event: IngredientChangedEvent,
  ): Promise<void> {
    try {
      const recipes = await this.recipeModel
        .find({ 'items.ingredientId': new Types.ObjectId(event.ingredientId) })
        .exec();

      for (const recipe of recipes) {
        const ingredientIds = recipe.items.map((item) =>
          item.ingredientId.toString(),
        );
        const ingredientMap = await this.validateAndFetchIngredients(
          ingredientIds,
          false,
        );
        await this.publishAvailabilityChanged(
          this.buildResponseDto(recipe, ingredientMap),
        );
      }
    } catch (error) {
      this.logger.error(
        `Error al recalcular disponibilidad tras '${event.action}' del ingrediente '${event.ingredientId}':`,
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
      recipe = await this.recipeModel
        .findOne({ plateId: idOrPlateId })
        .exec();
    }

    if (!recipe) {
      throw new NotFoundException(
        `Receta con identificador '${idOrPlateId}' no encontrada`,
      );
    }

    return recipe;
  }

  private async validateAndFetchIngredients(
    ingredientIds: string[],
    failOnMissing = true,
  ): Promise<Map<string, Ingredient>> {
    const map = new Map<string, Ingredient>();
    const uniqueIds = Array.from(new Set(ingredientIds));

    for (const id of uniqueIds) {
      try {
        const ingredient = await this.ingredientService.findOne(id);
        map.set(id, ingredient);
      } catch {
        if (failOnMissing) {
          throw new NotFoundException(
            `Ingrediente con id '${id}' no encontrado en el catálogo de inventario`,
          );
        }
      }
    }

    return map;
  }

  private buildResponseDto(
    recipe: Recipe,
    ingredientMap: Map<string, Ingredient>,
  ): RecipeResponseDto {
    let isAvailable = recipe.items.length > 0;
    let maxPortions = recipe.items.length > 0 ? Infinity : 0;
    let productionCost = 0;

    const itemDetails: RecipeItemDetailResponseDto[] = recipe.items.map(
      (item) => {
        const ingId = item.ingredientId.toString();
        const ingredient = ingredientMap.get(ingId);
        const ingInfo = ingredient as unknown as
          | {
              availableStock?: number;
              totalStock?: number;
              stock?: number;
              averageCost?: number;
              cost?: number;
            }
          | undefined;
        const stock =
          ingInfo?.availableStock ??
          ingInfo?.totalStock ??
          ingInfo?.stock ??
          0;
        const cost = ingInfo?.averageCost ?? ingInfo?.cost ?? 0;
        const name = ingredient?.name ?? 'Desconocido';
        const unit = ingredient?.unit ?? '';
        const hasSufficient = stock >= item.requiredQuantity;

        if (!hasSufficient) {
          isAvailable = false;
        }

        const itemPortions =
          item.requiredQuantity > 0
            ? Math.floor(stock / item.requiredQuantity)
            : 0;
        if (itemPortions < maxPortions) {
          maxPortions = itemPortions;
        }

        const itemCost = item.requiredQuantity * cost;
        productionCost += itemCost;

        return {
          ingredientId: ingId,
          ingredientName: name,
          unit,
          requiredQuantity: item.requiredQuantity,
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
