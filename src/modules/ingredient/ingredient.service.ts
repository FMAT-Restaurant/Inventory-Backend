import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Ingredient } from './schemas/ingredient.schema.js';
import { CreateIngredientDto } from './dto/create-ingredient.dto.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class IngredientService {
  constructor(
    @InjectModel(Ingredient.name) private ingredientModel: Model<Ingredient>,
  ) {}

  async create(createDto: CreateIngredientDto): Promise<Ingredient> {
    const newIngredient = new this.ingredientModel(createDto);

    try {
      return await newIngredient.save(); // Guarda en MongoDB
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
}
