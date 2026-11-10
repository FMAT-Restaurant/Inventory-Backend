import { check } from 'k6';
import { apiLoadOptions } from '../config/options.js';
import { batchPayload, itemPayload } from '../lib/data.js';
import { del, get, json, patch, post } from '../lib/http.js';
import { seedCatalog } from '../lib/setup.js';

export const options = apiLoadOptions;

export function setup() {
  return seedCatalog({ items: 3, batchQuantity: 100, withRecipe: true });
}

function readEndpoint(data) {
  const item = data.items[Math.floor(Math.random() * data.items.length)];
  const endpoints = [
    () => get('/items', { tag: 'mix/items-list' }),
    () => get('/items?q=k6', { tag: 'mix/items-search' }),
    () => get(`/items/${item.id}`, { tag: 'mix/items-get' }),
    () => get('/recipes', { tag: 'mix/recipes-list' }),
    () =>
      get(`/recipes/${data.recipe.plateId}`, {
        tag: 'mix/recipes-get',
      }),
    () =>
      get('/reservations/pending/summary', {
        tag: 'mix/reservations-summary',
      }),
    () => get('/movements?limit=10', { tag: 'mix/movements-list' }),
  ];

  return endpoints[Math.floor(Math.random() * endpoints.length)]();
}

export function readScenario(data) {
  const res = readEndpoint(data);
  check(res, {
    'lectura responde 200': (response) => response.status === 200,
  });
}

export function writeScenario() {
  const payload = itemPayload();

  const createdItem = post('/items', payload, { tag: 'mix/items-create' });
  const item = json(createdItem);
  const itemId = item && item._id;

  check(createdItem, {
    'escritura crea item 201': (res) => res.status === 201,
    'escritura obtiene id de item': () => Boolean(itemId),
  });

  if (!itemId) {
    return;
  }

  const createdBatch = post(
    '/batches',
    batchPayload(itemId, { quantity: 20 }),
    { tag: 'mix/batches-create' },
  );
  const batch = json(createdBatch);
  const batchId = batch && batch._id;

  check(createdBatch, {
    'escritura crea lote 201': (res) => res.status === 201,
    'escritura obtiene id de lote': () => Boolean(batchId),
  });

  const updated = patch(
    `/items/${itemId}`,
    { minStock: 9 },
    { tag: 'mix/items-update' },
  );
  check(updated, {
    'escritura actualiza item 200': (res) => res.status === 200,
  });

  if (batchId) {
    const removedBatch = del(`/batches/${batchId}`, {
      tag: 'mix/batches-delete',
    });
    check(removedBatch, {
      'escritura elimina lote 200': (res) => res.status === 200,
    });
  }

  const removedItem = del(`/items/${itemId}`, { tag: 'mix/items-delete' });
  check(removedItem, {
    'escritura desactiva item 200': (res) => res.status === 200,
  });
}

export default function (data) {
  readScenario(data);
}
