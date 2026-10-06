import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BatchStatus } from '../schemas/batch.schema.js';

export class CreateBatchDto {
  @ApiProperty({ description: 'Número de lote único', example: 'LOTE-2023-001' })
  @IsString()
  @IsNotEmpty()
  batchNumber: string;

  @ApiProperty({ description: 'ID del ingrediente (ObjectId)', example: '60d5ec...' })
  @IsMongoId()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({ description: 'Cantidad del lote', example: 100 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ description: 'Fecha de expiración', example: '2024-12-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  expirationDate: string;

  @ApiPropertyOptional({ description: 'ID del proveedor (ObjectId)', example: '60d5ec...' })
  @IsMongoId()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ description: 'Costo total o unitario del lote', example: 150.5 })
  @IsNumber()
  @Min(0)
  cost: number;

  @ApiPropertyOptional({ description: 'Estado del lote', enum: BatchStatus, default: BatchStatus.ACTIVE })
  @IsEnum(BatchStatus)
  @IsOptional()
  status?: BatchStatus;
}
