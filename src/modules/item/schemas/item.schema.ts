import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

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
export class Item extends Document {
  @Prop({ required: true, trim: true, unique: true })
  sku: string; // Ej: 'ING-0001', 'ING-0002'

  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ required: false, trim: true })
  description?: string;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ required: true })
  unit: string; // Ej: 'kg', 'g', 'ml', 'pza'

  @Prop({ required: true, default: 0, min: 0 })
  minStock: number;

  @Prop({ required: true, default: false })
  isPerishable: boolean;

  @Prop({ required: true, trim: true })
  storageCondition: string; // Ej: 'Refrigerado', 'Congelado', 'Ambiente'

  @Prop({ required: true, default: 0, min: 0 })
  averageCost: number;

  // El tipo del schema (no el de BSON) es el que permite castear el string
  // a ObjectId y que el virtual 'supplierSugested' pueda poblarse.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Supplier',
    default: null,
  })
  supplierIdSugested: Types.ObjectId | null;

  @Prop({ required: true, default: 0, min: 0 })
  reservedStock: number;

  @Prop({ required: true, default: 0, min: 0 })
  totalStock: number;

  // Baja lógica: el DELETE marca el item como inactivo en vez de borrarlo.
  @Prop({ required: true, default: true })
  isActive: boolean;

  declare supplierSugested?: Record<string, unknown> | null;

  declare availableStock: number;

  declare status: EstadoUmbral;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

ItemSchema.index({ isActive: 1 });

ItemSchema.virtual('supplierSugested', {
  ref: 'Supplier',
  localField: 'supplierIdSugested',
  foreignField: '_id',
  justOne: true,
});

ItemSchema.virtual('availableStock').get(function (this: Item) {
  return Math.max(0, (this.totalStock ?? 0) - (this.reservedStock ?? 0));
});

ItemSchema.virtual('status').get(function (this: Item) {
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
