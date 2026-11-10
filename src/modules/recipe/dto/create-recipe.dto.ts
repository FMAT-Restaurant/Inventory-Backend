import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/validation.js';
import { CreateRecipeItemDto } from './create-recipe-item.dto.js';

export class CreateRecipeDto {
  @ApiProperty({
    description: 'Identificador único del platillo',
    example: 'PLATE-BURGER-01',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  plateId: string;

  @ApiProperty({
    description: 'Nombre del platillo o receta',
    example: 'Hamburguesa clásica',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Lista de items e insumos necesarios para la receta',
    type: [CreateRecipeItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeItemDto)
  items: CreateRecipeItemDto[];
}
