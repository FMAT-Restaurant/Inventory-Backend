import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Ingredient } from './schemas/ingredient.schema.js';
import { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import { UpdateIngredientDto } from './dto/update-ingredient.dto.js';
import {
  INGREDIENT_CHANGED_EVENT,
  IngredientChangeEmitter,
} from './ingredient-change.emitter.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

// Los documentos creados antes de la baja lógica no tienen el campo 'isActive',
// por eso se usa '$ne: false' en lugar de 'true' para no ocultarlos.
const ACTIVE_INGREDIENT_FILTER = { isActive: { $ne: false } };

@Injectable()
export class IngredientService {
  constructor(
    @InjectModel(Ingredient.name) private ingredientModel: Model<Ingredient>,
    private readonly changeEmitter: IngredientChangeEmitter,
  ) {}

  async create(createDto: CreateIngredientDto): Promise<Ingredient> {
    const newIngredient = new this.ingredientModel(createDto);

    try {
      const saved = await newIngredient.save(); // Guarda en MongoDB
      this.changeEmitter.emit(INGREDIENT_CHANGED_EVENT, {
        ingredientId: (saved._id as Types.ObjectId).toString(),
        action: 'created',
      });
      return saved;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Ya existe un ingrediente con el nombre '${createDto.name}'`,
        );
      }
      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code: number }).code === DUPLICATE_KEY_ERROR_CODE
    );
  }

  async findAll(): Promise<Ingredient[]> {
    return this.ingredientModel.find(ACTIVE_INGREDIENT_FILTER).exec();
  }

  async findOne(id: string): Promise<Ingredient> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    const ingredient = await this.ingredientModel
      .findOne({ _id: id, ...ACTIVE_INGREDIENT_FILTER })
      .exec();
    if (!ingredient) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    return ingredient;
  }

  async update(
    id: string,
    updateDto: UpdateIngredientDto,
  ): Promise<Ingredient> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    if (Object.keys(updateDto).length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    try {
      // Se usa findOneAndUpdate (y no findByIdAndUpdate) porque este último
      // espera un id y descarta silenciosamente cualquier condición extra
      // del filtro, con lo que se actualizarían también los ingredientes
      // desactivados.
      const updated = await this.ingredientModel
        .findOneAndUpdate(
          { _id: id, ...ACTIVE_INGREDIENT_FILTER },
          updateDto,
          { new: true, runValidators: true },
        )
        .exec();

      if (!updated) {
        throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
      }

      this.changeEmitter.emit(INGREDIENT_CHANGED_EVENT, {
        ingredientId: id,
        action: 'updated',
      });

      return updated;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Ya existe un ingrediente con el nombre '${updateDto.name}'`,
        );
      }
      throw error;
    }
  }

  async updateStockAndCost(
    id: string,
    totalStock: number,
    averageCost?: number,
  ): Promise<Ingredient> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    const updateData: { totalStock: number; averageCost?: number } = {
      totalStock: Math.max(0, totalStock),
    };
    if (averageCost !== undefined) {
      updateData.averageCost = Math.max(0, averageCost);
    }

    const updated = await this.ingredientModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    this.changeEmitter.emit(INGREDIENT_CHANGED_EVENT, {
      ingredientId: id,
      action: 'updated',
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    // Baja lógica: el documento se conserva y solo se marca como inactivo.
    // findOneAndUpdate mantiene el filtro de ingredientes activos, así que un
    // ingrediente ya desactivado devuelve 404 en lugar de 200.
    const updated = await this.ingredientModel
      .findOneAndUpdate(
        { _id: id, ...ACTIVE_INGREDIENT_FILTER },
        { isActive: false },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    this.changeEmitter.emit(INGREDIENT_CHANGED_EVENT, {
      ingredientId: id,
      action: 'removed',
    });
  }
}
