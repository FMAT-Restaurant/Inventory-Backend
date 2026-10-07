import { PartialType } from '@nestjs/swagger';
import { CreateRecipeDto } from './create-recipe.dto.js';

export class UpdateRecipeDto extends PartialType(CreateRecipeDto) {}
