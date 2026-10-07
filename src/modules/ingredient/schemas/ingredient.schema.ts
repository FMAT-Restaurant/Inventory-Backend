import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum EstadoUmbral {
  OPTIMO = 'OPTIMO',
  BAJO = 'BAJO',
  CRITICO = 'CRITICO',
}

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Ingredient extends Document {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ required: true })
  unit: string; // Ej: 'kg', 'g', 'ml', 'pza'

  @Prop({ required: true, default: 0, min: 0 })
  minStock: number;

  @Prop({ required: true, default: 0, min: 0 })
  averageCost: number;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', default: null })
  supplierIdSugested: Types.ObjectId | null;

  @Prop({ required: true, default: 0, min: 0 })
  reservedStock: number;

  @Prop({ required: true, default: 0, min: 0 })
  totalStock: number;

  declare supplierSugested?: Record<string, unknown> | null;

  declare availableStock: number;

  declare status: EstadoUmbral;
}

export const IngredientSchema = SchemaFactory.createForClass(Ingredient);

IngredientSchema.virtual('supplierSugested', {
  ref: 'Supplier',
  localField: 'supplierIdSugested',
  foreignField: '_id',
  justOne: true,
});

IngredientSchema.virtual('availableStock').get(function (this: Ingredient) {
  return Math.max(0, (this.totalStock ?? 0) - (this.reservedStock ?? 0));
});

IngredientSchema.virtual('status').get(function (this: Ingredient) {
  const available = Math.max(
    0,
    (this.totalStock ?? 0) - (this.reservedStock ?? 0),
  );
  const min = this.minStock ?? 0;

  if (available <= 0) {
    return EstadoUmbral.CRITICO;
  }
  if (available <= min) {
    return EstadoUmbral.BAJO;
  }
  return EstadoUmbral.OPTIMO;
});
