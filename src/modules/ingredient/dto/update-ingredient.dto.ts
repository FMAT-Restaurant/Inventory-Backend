import { PartialType } from '@nestjs/swagger';
import { CreateIngredientDto } from './create-ingredient.dto.js';

export class UpdateIngredientDto extends PartialType(CreateIngredientDto) {}
