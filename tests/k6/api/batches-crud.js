import { check } from 'k6';
import { smokeOptions } from '../config/options.js';
import { batchPayload } from '../lib/data.js';
import { del, get, json, patch, post } from '../lib/http.js';
import { seedCatalog } from '../lib/setup.js';

export const options = smokeOptions;

export function setup() {
  return seedCatalog({ items: 1, batchQuantity: 100, withRecipe: false });
}

export default function (data) {
  const itemId = data.items[0].id;
  const itemBefore = json(get(`/items/${itemId}`, { tag: 'batches/item-before' }));
  const stockBefore = itemBefore ? itemBefore.totalStock : 0;

  const payload = batchPayload(itemId, { quantity: 25, cost: 12 });
  const created = post('/batches', payload, { tag: 'batches/create' });
  const batch = json(created);
  const batchId = batch && batch._id;

  check(created, {
    'crear lote responde 201': (res) => res.status === 201,
    'crear lote devuelve id': () => Boolean(batchId),
    'crear lote conserva cantidad': () =>
      Boolean(batch) && Number(batch.quantity) === 25,
  });

  const listed = get(`/batches?itemId=${itemId}`, { tag: 'batches/list' });
  check(listed, {
    'listar lotes por item responde 200': (res) => res.status === 200,
    'listar lotes incluye el registro': (res) => {
      const body = json(res);
      return (
        Array.isArray(body) && body.some((entry) => entry._id === batchId)
      );
    },
  });

  const itemAfterCreate = json(
    get(`/items/${itemId}`, { tag: 'batches/item-after-create' }),
  );
  check(itemAfterCreate, {
    'crear lote incrementa stock del item': (item) =>
      Boolean(item) && item.totalStock > stockBefore,
  });

  const updated = patch(
    `/batches/${batchId}`,
    { quantity: 10, reason: 'ajuste k6' },
    { tag: 'batches/update' },
  );
  check(updated, {
    'actualizar lote responde 200': (res) => res.status === 200,
    'actualizar lote cambia cantidad': (res) => {
      const body = json(res);
      return Boolean(body) && Number(body.quantity) === 10;
    },
  });

  const missingItem = post(
    '/batches',
    batchPayload('507f1f77bcf86cd799439011'),
    { tag: 'batches/missing-item' },
  );
  check(missingItem, {
    'crear lote con item inexistente responde 404': (res) =>
      res.status === 404,
  });

  const removed = del(`/batches/${batchId}`, { tag: 'batches/delete' });
  check(removed, {
    'eliminar lote responde 200': (res) => res.status === 200,
  });

  const afterDelete = get(`/batches/${batchId}`, {
    tag: 'batches/get-after-delete',
  });
  check(afterDelete, {
    'lote eliminado responde 404': (res) => res.status === 404,
  });
}
