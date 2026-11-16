import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const COST_HISTORY_DEFAULT_LIMIT = 20;
export const COST_HISTORY_MAX_LIMIT = 100;

export class QueryCostHistoryDto {
  @ApiPropertyOptional({ description: 'Filtrar por ID de item (ObjectId)' })
  @IsMongoId()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({
    description:
      'Fecha inicial de la compra (ISO 8601; con solo fecha incluye todo ese día)',
    example: '2026-11-01',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Fecha final de la compra (ISO 8601; con solo fecha incluye todo ese día)',
    example: '2026-11-30',
  })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Orden por fecha de compra: desc (más reciente primero) o asc',
    enum: ['desc', 'asc'],
    default: 'desc',
  })
  @IsIn(['desc', 'asc'])
  @IsOptional()
  order?: 'desc' | 'asc';

  @ApiPropertyOptional({ description: 'Página (desde 1)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: `Resultados por página (máximo ${COST_HISTORY_MAX_LIMIT})`,
    default: COST_HISTORY_DEFAULT_LIMIT,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COST_HISTORY_MAX_LIMIT)
  @IsOptional()
  limit?: number;
}
