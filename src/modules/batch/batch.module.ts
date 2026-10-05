import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BatchController } from './batch.controller.js';
import { BatchService } from './batch.service.js';
import { Batch, BatchSchema } from './schemas/batch.schema.js';
import { IngredientsModule } from '../ingredient/ingredient.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Batch.name, schema: BatchSchema },
    ]),
    IngredientsModule,
  ],
  controllers: [BatchController],
  providers: [BatchService],
})
export class BatchModule {}
