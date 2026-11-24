import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_QUANTITY,
  MaxDecimals,
  QUANTITY_DECIMALS,
} from '../../../common/validation.js';
import { CreateBatchDto } from './create-batch.dto.js';

// Usamos OmitType para quitar `itemId` (nunca editable) y redefinir
// `quantity` (permite 0 en ajustes/bajas) y `supplierId` (permite null para quitarlo).
// `batchNumber`, `supplierId` y `cost` solo se aceptan en el servicio si el lote no tiene consumo.
export class UpdateBatchDto extends PartialType(
  OmitType(CreateBatchDto, ['itemId', 'quantity', 'supplierId'] as const),
) {
  @ApiPropertyOptional({
    description: 'ID del proveedor (ObjectId o null para desasignar)',
    example: '60d5ec...',
    nullable: true,
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsMongoId()
  @IsOptional()
  supplierId?: string | null;

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
