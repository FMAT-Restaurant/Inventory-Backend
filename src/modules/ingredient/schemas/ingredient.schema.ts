import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true }) // timestamps añade automáticamente createdAt y updatedAt
export class Ingredient extends Document {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ required: true })
  unit: string; // Ej: 'kg', 'g', 'ml', 'pza'

  @Prop({ required: true, default: 0 })
  stock: number;

  @Prop({ required: true, default: 0 })
  cost: number;
}

export const IngredientSchema = SchemaFactory.createForClass(Ingredient);
