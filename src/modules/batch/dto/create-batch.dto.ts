import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBatchDto {
  @ApiPropertyOptional({
    description:
      'Número de lote (se combina con el SKU del item; si se omite, se genera automáticamente)',
    example: 'LOTE-2026-001',
  })
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
  @Min(0)
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
  @Min(0)
  cost: number;
}
