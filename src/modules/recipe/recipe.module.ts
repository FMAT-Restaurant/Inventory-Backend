import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecipeController } from './recipe.controller.js';
import { RecipeService } from './recipe.service.js';
import { Recipe, RecipeSchema } from './schemas/recipe.schema.js';
import { IngredientsModule } from '../ingredient/ingredient.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    IngredientsModule,
  ],
  controllers: [RecipeController],
  providers: [RecipeService],
  exports: [RecipeService],
})
export class RecipeModule {}
