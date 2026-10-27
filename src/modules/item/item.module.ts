import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemsController } from './item.controller.js';
import { ItemService } from './item.service.js';
import { Item, ItemSchema } from './schemas/item.schema.js';
import { ItemChangeEmitter } from './item-change.emitter.js';
import { ItemEvents } from './item.events.js';
import { BrokerModule } from '../../broker/broker.module.js';

@Module({
  imports: [
    // Registramos el esquema para este módulo
    MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }]),
    BrokerModule,
  ],
  controllers: [ItemsController],
  providers: [ItemService, ItemChangeEmitter, ItemEvents],
  exports: [ItemService, ItemChangeEmitter],
})
export class ItemsModule {}
