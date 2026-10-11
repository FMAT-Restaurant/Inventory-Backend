import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Ingredient } from './schemas/ingredient.schema.js';
import { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import {
  INGREDIENT_CHANGED_EVENT,
  IngredientChangeEmitter,
} from './ingredient-change.emitter.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

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
    return this.ingredientModel.find().exec(); // Busca todos en MongoDB
  }

  async findOne(id: string): Promise<Ingredient> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    const ingredient = await this.ingredientModel.findById(id).exec();
    if (!ingredient) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    return ingredient;
  }

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    const result = await this.ingredientModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Ingrediente con id '${id}' no encontrado`);
    }

    this.changeEmitter.emit(INGREDIENT_CHANGED_EVENT, {
      ingredientId: id,
      action: 'removed',
    });
  }
}
