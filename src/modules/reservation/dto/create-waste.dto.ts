import { ApiProperty } from '@nestjs/swagger';
import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_QUANTITY,
  MaxDecimals,
  QUANTITY_DECIMALS,
  Trim,
} from '../../../common/validation.js';

export class CreateWasteDto {
  @ApiProperty({
    description: 'Referencia de la orden servida a la que pertenece la merma',
    example: 'ORD-1001',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  orderId: string;

  @ApiProperty({
    description: 'Lote consumido por la orden del que se registra la merma',
    example: '60d5ec9af682fbd39a1b865b',
  })
  @IsMongoId()
  batchId: string;

  @ApiProperty({ description: 'Cantidad perdida', example: 0.5 })
  @IsNumber()
  @MaxDecimals(QUANTITY_DECIMALS)
  @Min(0.001)
  @Max(MAX_QUANTITY)
  quantity: number;

  @ApiProperty({
    description: 'Motivo de la merma',
    example: 'Platillo devuelto por el cliente sin reingreso posible',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
