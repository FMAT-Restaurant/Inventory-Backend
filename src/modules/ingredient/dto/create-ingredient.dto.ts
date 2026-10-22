import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateIngredientDto {
  @ApiProperty({
    description: 'Código SKU del ingrediente',
    example: 'ING-0001',
  })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ description: 'Nombre del ingrediente', example: 'Tomate' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del ingrediente',
    example: 'Tomate perita para salsas',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Categoría del ingrediente',
    example: 'Verduras',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ description: 'Unidad de medida', example: 'kg' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ description: 'Cantidad en minima para el stock', example: 10 })
  @IsNumber()
  @Min(0)
  minStock: number;

  @ApiPropertyOptional({
    description: 'Indica si el ingrediente es perecedero',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isPerishable?: boolean;

  @ApiProperty({
    description: 'Condición de almacenamiento',
    example: 'Refrigerado',
  })
  @IsString()
  @IsNotEmpty()
  storageCondition: string;

  @ApiPropertyOptional({
    description: 'Costo promedio por unidad de medida',
    example: 18.5,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  averageCost?: number;

  @ApiPropertyOptional({
    description: 'ID del proveedor sugerido',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsOptional()
  supplierIdSugested?: string;
}
