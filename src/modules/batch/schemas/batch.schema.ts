import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Usamos enum para los estados
export enum BatchStatus {
  ACTIVE = 'active',
  EXPIRES_TODAY = 'expires_today',
  EXPIRED = 'expired',
  DEPLETED = 'depleted',
}

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Batch extends Document {
  @Prop({ required: true, trim: true, uppercase: true })
  batchNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true })
  ingredientId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  initialQuantity: number;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true })
  expirationDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: false })
  supplierId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  cost: number;

  @Prop({ required: true, type: String, enum: BatchStatus, default: BatchStatus.ACTIVE })
  status: BatchStatus;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);

BatchSchema.index({ ingredientId: 1, batchNumber: 1 }, { unique: true });
