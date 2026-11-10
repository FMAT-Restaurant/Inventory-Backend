import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AMOUNT_DECIMALS,
  MAX_AMOUNT,
  MAX_QUANTITY,
  MaxDecimals,
  QUANTITY_DECIMALS,
  Trim,
} from '../../../common/validation.js';

export class CreateItemDto {
  @ApiProperty({
    description: 'Código SKU del item',
    example: 'ING-0001',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sku: string;

  @ApiProperty({ description: 'Nombre del item', example: 'Tomate' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del item',
    example: 'Tomate perita para salsas',
  })
  @Trim()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Categoría del item',
    example: 'Verduras',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category: string;

  @ApiProperty({ description: 'Unidad de medida', example: 'kg' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit: string;

  @ApiProperty({ description: 'Cantidad en minima para el stock', example: 10 })
  @IsNumber()
  @MaxDecimals(QUANTITY_DECIMALS)
  @Min(0)
  @Max(MAX_QUANTITY)
  minStock: number;

  @ApiPropertyOptional({
    description: 'Indica si el item es perecedero',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isPerishable?: boolean;

  @ApiProperty({
    description: 'Condición de almacenamiento',
    example: 'Refrigerado',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  storageCondition: string;

  @ApiPropertyOptional({
    description: 'Costo promedio por unidad de medida',
    example: 18.5,
  })
  @IsNumber()
  @MaxDecimals(AMOUNT_DECIMALS)
  @Min(0)
  @Max(MAX_AMOUNT)
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
