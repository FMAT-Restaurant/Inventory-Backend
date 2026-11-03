import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StockMovement,
  StockMovementSchema,
} from './schemas/stock-movement.schema.js';
import { StockMovementController } from './stock-movement.controller.js';
import { StockMovementService } from './stock-movement.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [StockMovementController],
  providers: [StockMovementService],
  exports: [StockMovementService],
})
export class StockMovementModule {}
