import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_QUANTITY,
  MaxDecimals,
  QUANTITY_DECIMALS,
} from '../../../common/validation.js';
import { CreateBatchDto } from './create-batch.dto.js';

// Usamos OmitType para quitar los campos que NO deben editarse nunca
// y PartialType para que el resto de campos sean opcionales.
// `quantity` se redefine para permitir 0 en ajustes/bajas (en alta debe ser > 0).
export class UpdateBatchDto extends PartialType(
  OmitType(CreateBatchDto, [
    'batchNumber',
    'itemId',
    'supplierId',
    'quantity',
  ] as const),
) {
  @ApiPropertyOptional({
    description: 'Nueva cantidad del lote (permite 0 para bajas o ajustes)',
    example: 100,
  })
  @IsNumber()
  @MaxDecimals(QUANTITY_DECIMALS)
  @Min(0)
  @Max(MAX_QUANTITY)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Motivo del ajuste de cantidad (solo se usa para auditoría)',
    example: 'Corrección por conteo físico',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
