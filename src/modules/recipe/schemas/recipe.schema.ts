import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class RecipeItem {
  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true })
  ingredientId: Types.ObjectId;

  @Prop({ required: true, min: 0.0001 })
  requiredQuantity: number;
}
export const RecipeItemSchema = SchemaFactory.createForClass(RecipeItem);

@Schema({ timestamps: true })
export class Recipe extends Document {
  @Prop({ required: true, trim: true, unique: true })
  plateId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [RecipeItemSchema], required: true, default: [] })
  items: RecipeItem[];
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe);
