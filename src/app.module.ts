import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { ItemsModule } from './modules/item/item.module.js';
import { BatchModule } from './modules/batch/batch.module.js';
import { SuppliersModule } from './modules/suppliers/supplier.module.js';
import { RecipeModule } from './modules/recipe/recipe.module.js';
import { TestModule } from './modules/test/test.module.js';

@Module({
  imports: [
    DatabaseModule,
    ItemsModule,
    BatchModule,
    SuppliersModule,
    RecipeModule,
    TestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
