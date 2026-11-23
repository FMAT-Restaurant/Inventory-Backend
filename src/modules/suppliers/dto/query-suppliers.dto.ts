import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/index.js';

export class QuerySuppliersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Incluir también los proveedores dados de baja (por defecto solo activos)',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  includeInactive?: boolean;
}
