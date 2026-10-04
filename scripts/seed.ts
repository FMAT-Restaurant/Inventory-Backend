import 'dotenv/config';
import mongoose from 'mongoose';
import { Ingredient, IngredientSchema } from '../src/modules/ingredient/schemas/ingredient.schema.js';

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  'mongodb://inventory:inventory_dev@localhost:27017/inventory?authSource=admin';

async function seed() {
  console.log(`Conectando a MongoDB en: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);

  const IngredientModel = mongoose.model(Ingredient.name, IngredientSchema);

  const testIngredients = [
    {
      name: 'Harina de Trigo',
      unit: 'kg',
      stock: 50,
      cost: 18.5,
    },
    {
      name: 'Aceite de Oliva',
      unit: 'litro',
      stock: 20,
      cost: 120.0,
    },
  ];

  for (const item of testIngredients) {
    const existing = await IngredientModel.findOne({ name: item.name });
    if (!existing) {
      const created = await IngredientModel.create(item);
      console.log(`Ingrediente creado: ${created.name} (ID: ${created._id})`);
    } else {
      console.log(`Ingrediente ya existe: ${existing.name} (ID: ${existing._id})`);
    }
  }

  await mongoose.disconnect();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error ejecutando seed:', err);
  process.exit(1);
});
