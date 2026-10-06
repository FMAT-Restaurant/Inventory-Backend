import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateIngredientDto {
  @ApiProperty({ description: 'Nombre del ingrediente', example: 'Tomate' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unidad de medida', example: 'kg' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ description: 'Cantidad en stock', example: 10 })
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ description: 'Costo unitario', example: 15.5, default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cost?: number;
}
