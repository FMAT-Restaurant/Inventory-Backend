import { check } from 'k6';
import { smokeOptions } from '../config/options.js';
import { itemPayload } from '../lib/data.js';
import { del, get, json, patch, post } from '../lib/http.js';

export const options = smokeOptions;

export default function () {
  const payload = itemPayload();

  const created = post('/items', payload, { tag: 'items/create' });
  const item = json(created);
  const itemId = item && item._id;

  check(created, {
    'crear item responde 201': (res) => res.status === 201,
    'crear item devuelve id': () => Boolean(itemId),
    'crear item conserva sku': () => Boolean(item) && item.sku === payload.sku,
  });

  const found = get(`/items/${itemId}`, { tag: 'items/get' });
  check(found, {
    'obtener item responde 200': (res) => res.status === 200,
    'obtener item conserva sku': (res) => {
      const body = json(res);
      return Boolean(body) && body.sku === payload.sku;
    },
  });

  const searchTerm = encodeURIComponent(payload.name.slice(0, 12));
  const searched = get(`/items?q=${searchTerm}`, { tag: 'items/search' });
  check(searched, {
    'buscar item responde 200': (res) => res.status === 200,
    'buscar item encuentra el registro': (res) => {
      const body = json(res);
      return Array.isArray(body) && body.some((entry) => entry._id === itemId);
    },
  });

  const updated = patch(
    `/items/${itemId}`,
    { minStock: 7, description: 'actualizado por k6' },
    { tag: 'items/update' },
  );
  check(updated, {
    'actualizar item responde 200': (res) => res.status === 200,
    'actualizar item cambia minStock': (res) => {
      const body = json(res);
      return Boolean(body) && body.minStock === 7;
    },
  });

  const invalid = post('/items', { name: payload.name }, {
    tag: 'items/invalid',
  });
  check(invalid, {
    'item inválido responde 400': (res) => res.status === 400,
  });

  const duplicate = post('/items', payload, { tag: 'items/duplicate' });
  check(duplicate, {
    'item duplicado responde 409': (res) => res.status === 409,
  });

  const removed = del(`/items/${itemId}`, { tag: 'items/delete' });
  check(removed, {
    'desactivar item responde 200': (res) => res.status === 200,
  });

  const afterDelete = get(`/items/${itemId}`, {
    tag: 'items/get-after-delete',
  });
  check(afterDelete, {
    'item desactivado responde 404': (res) => res.status === 404,
  });
}
