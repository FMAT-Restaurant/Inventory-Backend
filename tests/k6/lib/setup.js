import { RESET_DB } from '../config/env.js';
import {
  batchPayload,
  itemPayload,
  recipePayload,
  supplierPayload,
} from './data.js';
import { del, expectStatus, json, post } from './http.js';

export function resetDatabaseIfRequested() {
  if (!RESET_DB) {
    return null;
  }

  const res = del('/apo/test/reset', { tag: 'setup/reset' });
  expectStatus(res, 200, 'reset database');
  return res;
}

export function createSupplier(overrides = {}) {
  const res = post('/suppliers', supplierPayload(overrides), {
    tag: 'setup/suppliers',
  });
  expectStatus(res, 201, 'setup create supplier');
  return json(res);
}

export function createItem(overrides = {}) {
  const res = post('/items', itemPayload(overrides), {
    tag: 'setup/items',
  });
  expectStatus(res, 201, 'setup create item');
  return json(res);
}

export function createBatch(itemId, overrides = {}) {
  const res = post('/batches', batchPayload(itemId, overrides), {
    tag: 'setup/batches',
  });
  expectStatus(res, 201, 'setup create batch');
  return json(res);
}

export function createRecipe(itemIds, overrides = {}) {
  const res = post('/recipes', recipePayload(itemIds, overrides), {
    tag: 'setup/recipes',
  });
  expectStatus(res, [200, 201], 'setup create recipe');
  return json(res);
}

export function seedCatalog({
  items = 1,
  batchQuantity = 100,
  withRecipe = true,
  withSupplier = false,
} = {}) {
  resetDatabaseIfRequested();

  const supplier = withSupplier ? createSupplier() : null;
  const createdItems = [];

  for (let index = 0; index < items; index += 1) {
    const item = createItem(
      supplier
        ? { supplierIdSugested: supplier._id }
        : {},
    );
    createBatch(item._id, { quantity: batchQuantity });
    createdItems.push({
      id: item._id,
      name: item.name,
      sku: item.sku,
    });
  }

  const recipe = withRecipe
    ? createRecipe(createdItems.map((item) => item.id))
    : null;

  return {
    supplier,
    items: createdItems,
    recipe,
  };
}
