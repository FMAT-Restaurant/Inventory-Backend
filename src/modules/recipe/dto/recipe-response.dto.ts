import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecipeItemDetailResponseDto {
  @ApiProperty({
    description: 'ID del ingrediente',
    example: '60d5ec9af682fbd39a1b865b',
  })
  ingredientId: string;

  @ApiProperty({
    description: 'Nombre del ingrediente',
    example: 'Carne de res molida',
  })
  ingredientName: string;

  @ApiProperty({
    description: 'Unidad de medida',
    example: 'kg',
  })
  unit: string;

  @ApiProperty({
    description: 'Cantidad requerida para una porción de la receta',
    example: 0.2,
  })
  requiredQuantity: number;

  @ApiProperty({
    description: 'Stock actual disponible en inventario',
    example: 5.0,
  })
  availableStock: number;

  @ApiProperty({
    description: 'Indica si existe suficiente stock para al menos una porción',
    example: true,
  })
  hasSufficientStock: boolean;
}

export class RecipeResponseDto {
  @ApiProperty({
    description: 'ID único de la receta en MongoDB (ObjectId)',
    example: '60d5ec9af682fbd39a1b865c',
  })
  id: string;

  @ApiProperty({
    description: 'Identificador único del platillo',
    example: 'PLATE-BURGER-01',
  })
  plateId: string;

  @ApiProperty({
    description: 'Nombre del platillo o receta',
    example: 'Hamburguesa clásica',
  })
  name: string;

  @ApiProperty({
    description: 'Indica si la receta está disponible según las existencias de todos sus insumos',
    example: true,
  })
  isAvailable: boolean;

  @ApiProperty({
    description: 'Número máximo de porciones que se pueden preparar con el stock actual',
    example: 25,
  })
  maxPreparablePortions: number;

  @ApiProperty({
    description: 'Costo total estimado de producción por porción según costo unitario de ingredientes',
    example: 45.5,
  })
  productionCost: number;

  @ApiProperty({
    description: 'Lista detallada de ingredientes requeridos y su disponibilidad',
    type: [RecipeItemDetailResponseDto],
  })
  items: RecipeItemDetailResponseDto[];

  @ApiPropertyOptional({
    description: 'Fecha de creación del registro',
  })
  createdAt?: Date;

  @ApiPropertyOptional({
    description: 'Fecha de última actualización del registro',
  })
  updatedAt?: Date;
}
