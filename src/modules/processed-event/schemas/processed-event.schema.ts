import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  collection: 'processed_events',
  timestamps: { createdAt: true, updatedAt: false },
})
export class ProcessedEvent extends Document {
  @Prop({ required: true, trim: true })
  consumer: string;

  @Prop({ required: true, trim: true })
  eventId: string;

  createdAt: Date;
}

export const ProcessedEventSchema =
  SchemaFactory.createForClass(ProcessedEvent);

ProcessedEventSchema.index({ consumer: 1, eventId: 1 }, { unique: true });
// Los identificadores de eventos se conservan 30 días para deduplicar
// reentregas tardías del broker.
ProcessedEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);
