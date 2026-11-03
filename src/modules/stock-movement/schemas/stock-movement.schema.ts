import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum StockMovementType {
  IN = 'in',
  OUT = 'out',
  WASTE = 'waste',
  ADJUSTMENT = 'adjustment',
}

@Schema({
  collection: 'stock_movements',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class StockMovement extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true })
  batchId: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: StockMovementType,
  })
  movementType: StockMovementType;

  @Prop({ required: true, min: -999999999.999, max: 999999999.999 })
  quantity: number;

  @Prop({ type: String, default: null, trim: true })
  referenceId?: string | null;

  @Prop({ type: String, default: null, trim: true })
  reason?: string | null;

  @Prop({ required: true, type: String, trim: true, maxlength: 50, default: 'system' })
  createdBy: string;

  createdAt: Date;
}

export const StockMovementSchema =
  SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ batchId: 1, createdAt: -1 });
StockMovementSchema.index({ movementType: 1, createdAt: -1 });
StockMovementSchema.index({ referenceId: 1 });
