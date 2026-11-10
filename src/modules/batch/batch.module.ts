import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BatchController } from './batch.controller.js';
import { BatchService } from './batch.service.js';
import { Batch, BatchSchema } from './schemas/batch.schema.js';
import { ItemsModule } from '../item/item.module.js';
import { BatchEvents } from './batch.events.js';
import { BatchExpiryService } from './batch-expiry.service.js';
import { BrokerModule } from '../../broker/broker.module.js';
import { SuppliersModule } from '../suppliers/supplier.module.js';
import { StockMovementModule } from '../stock-movement/stock-movement.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Batch.name, schema: BatchSchema }]),
    ItemsModule,
    BrokerModule,
    StockMovementModule,
    SuppliersModule,
  ],
  controllers: [BatchController],
  providers: [BatchService, BatchEvents, BatchExpiryService],
  exports: [BatchService],
})
export class BatchModule {}
