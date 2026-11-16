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

/** Merma manual: solo el lote, la cantidad perdida y el motivo. */
export class CreateWasteDto {
  @ApiProperty({
    description: 'Lote en el que se generó la merma',
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
    example: 'Se cayó durante el acomodo del almacén',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
