import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IngredientsController } from './ingredient.controller.js';
import { IngredientService } from './ingredient.service.js';
import { Ingredient, IngredientSchema } from './schemas/ingredient.schema.js';
import { IngredientChangeEmitter } from './ingredient-change.emitter.js';
import { IngredientEvents } from './ingredient.events.js';
import { BrokerModule } from '../../broker/broker.module.js';

@Module({
  imports: [
    // Registramos el esquema para este módulo
    MongooseModule.forFeature([
      { name: Ingredient.name, schema: IngredientSchema },
    ]),
    BrokerModule,
  ],
  controllers: [IngredientsController],
  providers: [IngredientService, IngredientChangeEmitter, IngredientEvents],
  exports: [IngredientService, IngredientChangeEmitter],
})
export class IngredientsModule {}
