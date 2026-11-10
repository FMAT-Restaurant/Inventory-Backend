import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
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

export class CreateBatchDto {
  @ApiPropertyOptional({
    description:
      'Número de lote (se combina con el SKU del item; si se omite, se genera automáticamente)',
    example: 'LOTE-2026-001',
  })
  @Trim()
  @IsString()
  @MaxLength(60)
  @IsOptional()
  batchNumber?: string;

  @ApiProperty({ description: 'ID del item (ObjectId)', example: '60d5ec...' })
  @IsMongoId()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: 'Cantidad del lote', example: 100 })
  @IsNumber()
  @MaxDecimals(QUANTITY_DECIMALS)
  @Min(0)
  @Max(MAX_QUANTITY)
  quantity: number;

  @ApiProperty({
    description: 'Fecha de expiración',
    example: '2026-12-31T23:59:59Z',
  })
  @IsDateString()
  @IsNotEmpty()
  expirationDate: string;

  @ApiPropertyOptional({
    description: 'ID del proveedor (ObjectId)',
    example: '60d5ec...',
  })
  @IsMongoId()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ description: 'Costo unitario del lote', example: 150.5 })
  @IsNumber()
  @MaxDecimals(AMOUNT_DECIMALS)
  @Min(0)
  @Max(MAX_AMOUNT)
  cost: number;
}
