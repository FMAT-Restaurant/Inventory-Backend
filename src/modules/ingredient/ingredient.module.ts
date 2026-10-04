import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IngredientsController } from './ingredient.controller.js';
import { IngredientService } from './ingredient.service.js';
import { Ingredient, IngredientSchema } from './schemas/ingredient.schema.js';

@Module({
  imports: [
    // Registramos el esquema para este módulo
    MongooseModule.forFeature([
      { name: Ingredient.name, schema: IngredientSchema },
    ]),
  ],
  controllers: [IngredientsController],
  providers: [IngredientService],
})
export class IngredientsModule {}
