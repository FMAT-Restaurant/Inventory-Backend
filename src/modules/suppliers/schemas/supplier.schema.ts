import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Supplier extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: false, trim: true })
  contactName?: string;

  @Prop({ required: false, trim: true })
  phone?: string;

  @Prop({ required: false, trim: true, lowercase: true })
  email?: string;

  @Prop({ required: false, trim: true })
  address?: string;

  // Baja lógica: el DELETE marca el proveedor como inactivo en vez de
  // borrarlo, para que los lotes e items que lo referencian lo conserven.
  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

// El nombre es único sin distinguir mayúsculas y solo entre proveedores
// activos: un proveedor dado de baja libera su nombre.
SupplierSchema.index(
  { name: 1 },
  {
    name: 'name_unique_active_ci',
    unique: true,
    collation: { locale: 'en', strength: 2 },
    partialFilterExpression: { isActive: true },
  },
);
