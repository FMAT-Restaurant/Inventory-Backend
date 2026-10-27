import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryItemsDto {
  @ApiPropertyOptional({
    description:
      'Texto para buscar items por nombre (coincidencia parcial, sin distinguir mayúsculas)',
    example: 'tomate',
  })
  @IsString()
  @IsOptional()
  q?: string;
}
