import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBatchDto {
  @ApiPropertyOptional({
    description: 'Número de lote único (si se omite, se genera automáticamente)',
    example: 'LOTE-2026-001',
  })
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiProperty({ description: 'ID del ingrediente (ObjectId)', example: '60d5ec...' })
  @IsMongoId()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({ description: 'Cantidad del lote', example: 100 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ description: 'Fecha de expiración', example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  expirationDate: string;

  @ApiPropertyOptional({ description: 'ID del proveedor (ObjectId)', example: '60d5ec...' })
  @IsMongoId()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ description: 'Costo unitario del lote', example: 150.5 })
  @IsNumber()
  @Min(0)
  cost: number;
}
