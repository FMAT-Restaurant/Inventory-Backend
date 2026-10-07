import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true }) // Añade createdAt y updatedAt
export class Supplier extends Document {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ required: false, trim: true })
  contactName?: string;

  @Prop({ required: false, trim: true })
  phone?: string;

  @Prop({ required: false, trim: true, lowercase: true })
  email?: string;

  @Prop({ required: false, trim: true })
  address?: string;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
