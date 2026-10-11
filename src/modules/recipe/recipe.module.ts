import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecipeController } from './recipe.controller.js';
import { RecipeService } from './recipe.service.js';
import { RecipeEventsService } from './recipe-events.service.js';
import { Recipe, RecipeSchema } from './schemas/recipe.schema.js';
import { IngredientsModule } from '../ingredient/ingredient.module.js';
import { BrokerModule } from '../../broker/broker.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    IngredientsModule,
    BrokerModule,
  ],
  controllers: [RecipeController],
  providers: [RecipeService, RecipeEventsService],
  exports: [RecipeService],
})
export class RecipeModule {}
