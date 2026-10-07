import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateRecipeItemDto } from './create-recipe-item.dto.js';

export class CreateRecipeDto {
  @ApiProperty({
    description: 'Identificador único del platillo',
    example: 'PLATE-BURGER-01',
  })
  @IsString()
  @IsNotEmpty()
  plateId: string;

  @ApiProperty({
    description: 'Nombre del platillo o receta',
    example: 'Hamburguesa clásica',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Lista de ingredientes e insumos necesarios para la receta',
    type: [CreateRecipeItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeItemDto)
  items: CreateRecipeItemDto[];
}
