import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/index.js';

export class QueryBatchesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar lotes por ID de item (ObjectId)',
  })
  @IsMongoId()
  @IsOptional()
  itemId?: string;
}
