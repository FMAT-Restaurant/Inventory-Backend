import { check } from 'k6';
import { POLL_TIMEOUT_MS } from '../config/env.js';
import { eventsOptions } from '../config/options.js';
import {
  connect,
  declareExchange,
  publish,
} from '../lib/amqp.js';
import { menuPlateEvent, uniqueSuffix } from '../lib/data.js';
import { get, json, poll } from '../lib/http.js';
import { eventProcessing } from '../lib/metrics.js';
import { seedCatalog } from '../lib/setup.js';

export const options = eventsOptions;

export function setup() {
  return seedCatalog({ items: 1, batchQuantity: 100, withRecipe: false });
}

export default function (data) {
  connect();
  declareExchange('menu.topic');
  declareExchange('inventory.topic');

  const suffix = uniqueSuffix();
  const plateId = `K6-MENU-${suffix}`.toUpperCase();
  const itemId = data.items[0].id;

  publish(
    'menu.topic',
    'menu.source.created',
    menuPlateEvent({
      sourceId: plateId,
      name: `k6 menu ${suffix}`,
      items: [{ id: itemId, quantity: 1 }],
    }),
  );

  const created = poll(
    () => get(`/recipes/${plateId}`, { tag: 'menu/recipe-created' }),
    (res) => res.status === 200,
    { timeout: POLL_TIMEOUT_MS },
  );
  check(created, {
    'menu.source.created registra la receta': (result) => result.ok,
  });
  eventProcessing.add(created.elapsed);

  if (created.ok) {
    const recipe = json(created.value);
    check(recipe, {
      'receta creada con plateId correcto': (body) =>
        Boolean(body) && body.plateId === plateId,
      'receta creada disponible': (body) =>
        Boolean(body) && body.isAvailable === true,
      'receta creada con porciones': (body) =>
        Boolean(body) && Number(body.maxPreparablePortions) >= 1,
    });
  }

  publish(
    'menu.topic',
    'menu.source.updated',
    menuPlateEvent({
      sourceId: plateId,
      name: `k6 menu updated ${suffix}`,
      items: [{ id: itemId, quantity: 2 }],
    }),
  );

  const updated = poll(
    () => get(`/recipes/${plateId}`, { tag: 'menu/recipe-updated' }),
    (res) => {
      const body = json(res);
      return (
        res.status === 200 &&
        Boolean(body) &&
        body.name === `k6 menu updated ${suffix}`
      );
    },
    { timeout: POLL_TIMEOUT_MS },
  );
  check(updated, {
    'menu.source.updated actualiza la receta': (result) => result.ok,
  });
  eventProcessing.add(updated.elapsed);

  publish('menu.topic', 'menu.source.deleted', { sourceId: plateId });

  const deleted = poll(
    () => get(`/recipes/${plateId}`, { tag: 'menu/recipe-deleted' }),
    (res) => res.status === 404,
    { timeout: POLL_TIMEOUT_MS },
  );
  check(deleted, {
    'menu.source.deleted elimina la receta': (result) => result.ok,
  });
  eventProcessing.add(deleted.elapsed);
}
