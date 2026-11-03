import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateBatchDto } from './create-batch.dto.js';

// Usamos OmitType para quitar los campos que NO deben editarse nunca
// y PartialType para que el resto de campos sean opcionales.
export class UpdateBatchDto extends PartialType(
  OmitType(CreateBatchDto, ['batchNumber', 'itemId', 'supplierId'] as const),
) {
  @ApiPropertyOptional({
    description: 'Motivo del ajuste de cantidad (solo se usa para auditoría)',
    example: 'Corrección por conteo físico',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Usuario responsable del ajuste (solo se usa para auditoría)',
    example: 'system',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  createdBy?: string;
}
