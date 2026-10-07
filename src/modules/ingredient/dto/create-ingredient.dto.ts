import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateIngredientDto {
  @ApiProperty({ description: 'Nombre del ingrediente', example: 'Tomate' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unidad de medida', example: 'kg' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ description: 'Cantidad en minima para el stock', example: 10 })
  @IsNumber()
  @Min(0)
  minStock: number;

  @ApiProperty({
    description: 'Categoría del ingrediente',
    example: 'Verduras',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({
    description: 'ID del proveedor sugerido',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsOptional()
  supplierIdSugested?: string;
}
