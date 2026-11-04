import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProcessedEvent,
  ProcessedEventSchema,
} from './schemas/processed-event.schema.js';
import { ProcessedEventService } from './processed-event.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProcessedEvent.name, schema: ProcessedEventSchema },
    ]),
  ],
  providers: [ProcessedEventService],
  exports: [ProcessedEventService],
})
export class ProcessedEventModule {}
