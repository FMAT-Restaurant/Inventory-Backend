import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/index.js';

export class QueryItemsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Texto para buscar items por nombre (coincidencia parcial, sin distinguir mayúsculas)',
    example: 'tomate',
  })
  @IsString()
  @IsOptional()
  q?: string;
}
