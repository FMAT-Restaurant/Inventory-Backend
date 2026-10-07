import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateRecipeItemDto {
  @ApiProperty({
    description: 'ID del ingrediente (ObjectId)',
    example: '60d5ec9af682fbd39a1b865b',
  })
  @IsMongoId()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({
    description: 'Cantidad requerida del ingrediente',
    example: 0.25,
    minimum: 0.0001,
  })
  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  requiredQuantity: number;
}
