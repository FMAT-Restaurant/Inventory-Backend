import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

export class QueryPendingSummaryDto {
  @ApiPropertyOptional({ description: 'Filtrar por ID de item (ObjectId)' })
  @IsMongoId()
  @IsOptional()
  itemId?: string;
}
