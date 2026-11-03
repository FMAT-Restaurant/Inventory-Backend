import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { StockMovementType } from '../schemas/stock-movement.schema.js';

export class QueryStockMovementsDto {
  @ApiPropertyOptional({ description: 'Filtrar por ID de lote (ObjectId)' })
  @IsMongoId()
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de movimiento',
    enum: StockMovementType,
  })
  @IsEnum(StockMovementType)
  @IsOptional()
  movementType?: StockMovementType;

  @ApiPropertyOptional({
    description: 'Filtrar por referencia externa (orden, platillo, etc.)',
  })
  @IsString()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({
    description: 'Fecha inicial (ISO 8601)',
    example: '2026-11-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha final (ISO 8601)',
    example: '2026-11-30T23:59:59.999Z',
  })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'Máximo de resultados a devolver' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
