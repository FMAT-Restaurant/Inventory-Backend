import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BrokerModule } from '../../broker/broker.module.js';
import { BatchModule } from '../batch/batch.module.js';
import { ItemsModule } from '../item/item.module.js';
import { ProcessedEventModule } from '../processed-event/processed-event.module.js';
import { RecipeModule } from '../recipe/recipe.module.js';
import { Recipe, RecipeSchema } from '../recipe/schemas/recipe.schema.js';
import { StockMovementModule } from '../stock-movement/stock-movement.module.js';
import { OrdersEvents } from './orders.events.js';
import { ReservationCacheService } from './reservation-cache.service.js';
import { ReservationController } from './reservation.controller.js';
import { ReservationExpiryService } from './reservation-expiry.service.js';
import { ReservationService } from './reservation.service.js';
import {
  StockReservation,
  StockReservationSchema,
} from './schemas/stock-reservation.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockReservation.name, schema: StockReservationSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    ItemsModule,
    RecipeModule,
    BatchModule,
    StockMovementModule,
    BrokerModule,
    ProcessedEventModule,
  ],
  controllers: [ReservationController],
  providers: [
    ReservationService,
    ReservationCacheService,
    ReservationExpiryService,
    OrdersEvents,
  ],
  exports: [ReservationService],
})
export class ReservationModule {}
