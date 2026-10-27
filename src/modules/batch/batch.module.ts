import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BatchController } from './batch.controller.js';
import { BatchService } from './batch.service.js';
import { Batch, BatchSchema } from './schemas/batch.schema.js';
import { ItemsModule } from '../item/item.module.js';
import { BatchEvents } from './batch.events.js';
import { BrokerModule } from '../../broker/broker.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Batch.name, schema: BatchSchema }]),
    ItemsModule,
    BrokerModule,
  ],
  controllers: [BatchController],
  providers: [BatchService, BatchEvents],
})
export class BatchModule {}
