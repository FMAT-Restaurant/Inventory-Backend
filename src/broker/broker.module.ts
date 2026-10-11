import { Module } from '@nestjs/common';
import { EventPublisher } from './event-publisher.service.js';
import { EventConsumer } from './event-customer.service.js';

@Module({
  providers: [EventPublisher, EventConsumer],
  exports: [EventPublisher, EventConsumer],
})
export class BrokerModule {}
