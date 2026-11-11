import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsNumber, Max, Min } from 'class-validator';
import {
  AMOUNT_DECIMALS,
  MAX_QUANTITY,
  MaxDecimals,
} from '../../../common/validation.js';

export class CreateRecipeItemDto {
  @ApiProperty({
    description: 'ID del item (ObjectId)',
    example: '60d5ec9af682fbd39a1b865b',
  })
  @IsMongoId()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({
    description: 'Cantidad requerida del item',
    example: 0.25,
    minimum: 0.0001,
  })
  @IsNumber()
  @MaxDecimals(AMOUNT_DECIMALS)
  @Min(0.0001)
  @Max(MAX_QUANTITY)
  @IsNotEmpty()
  requiredQuantity: number;
}
