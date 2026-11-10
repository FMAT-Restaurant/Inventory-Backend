import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from '../modules/item/dto/create-item.dto.js';
import { CreateBatchDto } from '../modules/batch/dto/create-batch.dto.js';
import { CreateSupplierDto } from '../modules/suppliers/dto/create-supplier.dto.js';
import { CreateRecipeDto } from '../modules/recipe/dto/create-recipe.dto.js';
import { UpdateRecipeDto } from '../modules/recipe/dto/update-recipe.dto.js';

const ITEM_ID = '507f1f77bcf86cd799439011';

async function failingProperties(
  dto: new () => object,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, payload));
  return errors.map((error) => error.property).sort();
}

const item = {
  sku: 'ING-0001',
  name: 'Tomate',
  category: 'Verduras',
  unit: 'kg',
  minStock: 10,
  storageCondition: 'Refrigerado',
};
const batch = {
  itemId: ITEM_ID,
  quantity: 10,
  cost: 15,
  expirationDate: '2099-12-31',
};
const recipe = {
  plateId: 'PLATE-1',
  name: 'Pizza',
  items: [{ itemId: ITEM_ID, requiredQuantity: 1 }],
};

describe('validación compartida de DTOs', () => {
  it('recorta los espacios de los textos', () => {
    const dto = plainToInstance(CreateItemDto, { ...item, name: '  Tomate  ' });
    expect(dto.name).toBe('Tomate');
  });

  it('rechaza textos formados solo por espacios', async () => {
    await expect(
      failingProperties(CreateItemDto, {
        ...item,
        sku: '   ',
        name: '   ',
        category: ' ',
        unit: ' ',
        storageCondition: '  ',
      }),
    ).resolves.toEqual(['category', 'name', 'sku', 'storageCondition', 'unit']);
    await expect(
      failingProperties(CreateSupplierDto, { name: '   ' }),
    ).resolves.toEqual(['name']);
    await expect(
      failingProperties(CreateRecipeDto, {
        ...recipe,
        plateId: ' ',
        name: ' ',
      }),
    ).resolves.toEqual(['name', 'plateId']);
    await expect(
      failingProperties(UpdateRecipeDto, { name: '   ' }),
    ).resolves.toEqual(['name']);
  });

  it('acepta valores dentro de los topes', async () => {
    await expect(failingProperties(CreateItemDto, item)).resolves.toEqual([]);
    await expect(failingProperties(CreateBatchDto, batch)).resolves.toEqual([]);
    await expect(failingProperties(CreateRecipeDto, recipe)).resolves.toEqual(
      [],
    );
  });

  it('limita la longitud de los textos', async () => {
    await expect(
      failingProperties(CreateItemDto, { ...item, name: 'x'.repeat(121) }),
    ).resolves.toEqual(['name']);
    await expect(
      failingProperties(CreateSupplierDto, { name: 'x'.repeat(121) }),
    ).resolves.toEqual(['name']);
  });

  it('limita magnitud y decimales de cantidades y costos', async () => {
    await expect(
      failingProperties(CreateBatchDto, {
        ...batch,
        quantity: 1e300,
        cost: 1e300,
      }),
    ).resolves.toEqual(['cost', 'quantity']);
    await expect(
      failingProperties(CreateBatchDto, { ...batch, quantity: 0.0000001 }),
    ).resolves.toEqual(['quantity']);
    await expect(
      failingProperties(CreateItemDto, { ...item, minStock: 1e308 }),
    ).resolves.toEqual(['minStock']);
  });

  it('limita el número de insumos de una receta', async () => {
    await expect(
      failingProperties(CreateRecipeDto, {
        ...recipe,
        items: Array.from({ length: 101 }, () => recipe.items[0]),
      }),
    ).resolves.toEqual(['items']);
  });
});
