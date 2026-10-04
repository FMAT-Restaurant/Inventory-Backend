import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { IngredientsModule } from './modules/ingredient/ingredient.module.js';

@Module({
  imports: [DatabaseModule, IngredientsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
