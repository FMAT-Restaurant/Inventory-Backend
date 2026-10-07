import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Ingredient } from '../ingredient/schemas/ingredient.schema.js';
import { IngredientService } from '../ingredient/ingredient.service.js';
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
export class RecipeService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    private readonly ingredientService: IngredientService,
  ) {}

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

    return {
      recipe: this.buildResponseDto(recipe, ingredientMap),
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

    return this.buildResponseDto(recipe, ingredientMap);
  }

  async remove(idOrPlateId: string): Promise<void> {
    const filter = isValidObjectId(idOrPlateId)
      ? { $or: [{ _id: idOrPlateId }, { plateId: idOrPlateId }] }
      : { plateId: idOrPlateId };

    const result = await this.recipeModel.deleteOne(filter).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(
        `Receta con identificador '${idOrPlateId}' no encontrada`,
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
