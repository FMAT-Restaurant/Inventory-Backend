import { check } from 'k6';
import { smokeOptions } from '../config/options.js';
import { recipePayload } from '../lib/data.js';
import { del, get, json, patch, post } from '../lib/http.js';
import { seedCatalog } from '../lib/setup.js';

export const options = smokeOptions;

export function setup() {
  return seedCatalog({ items: 2, batchQuantity: 50, withRecipe: false });
}

export default function (data) {
  const itemIds = data.items.map((item) => item.id);
  const payload = recipePayload(itemIds);

  const created = post('/recipes', payload, { tag: 'recipes/create' });
  const recipe = json(created);

  check(created, {
    'crear receta responde 200/201': (res) => [200, 201].includes(res.status),
    'crear receta conserva plateId': () =>
      Boolean(recipe) && recipe.plateId === payload.plateId,
    'crear receta calcula disponibilidad': () =>
      Boolean(recipe) && recipe.isAvailable === true,
    'crear receta calcula porciones': () =>
      Boolean(recipe) &&
      Number(recipe.maxPreparablePortions) >= 1,
    'crear receta calcula costo': () =>
      Boolean(recipe) && Number(recipe.productionCost) > 0,
  });

  const found = get(`/recipes/${payload.plateId}`, {
    tag: 'recipes/get',
  });
  check(found, {
    'obtener receta responde 200': (res) => res.status === 200,
    'obtener receta devuelve items': (res) => {
      const body = json(res);
      return Boolean(body) && Array.isArray(body.items) && body.items.length === 2;
    },
  });

  const available = get('/recipes?available=true', {
    tag: 'recipes/list-available',
  });
  check(available, {
    'listar recetas disponibles responde 200': (res) => res.status === 200,
    'listar recetas incluye la receta': (res) => {
      const body = json(res);
      return (
        Array.isArray(body) &&
        body.some((entry) => entry.plateId === payload.plateId)
      );
    },
  });

  const updated = patch(
    `/recipes/${payload.plateId}`,
    { name: `${payload.name} updated` },
    { tag: 'recipes/update' },
  );
  check(updated, {
    'actualizar receta responde 200': (res) => res.status === 200,
    'actualizar receta cambia nombre': (res) => {
      const body = json(res);
      return Boolean(body) && body.name === `${payload.name} updated`;
    },
  });

  const invalid = post(
    '/recipes',
    { plateId: `${payload.plateId}-INVALID`, name: 'sin items', items: [] },
    { tag: 'recipes/invalid' },
  );
  check(invalid, {
    'receta sin items responde 400': (res) => res.status === 400,
  });

  const missingItem = post(
    '/recipes',
    recipePayload(['507f1f77bcf86cd799439011']),
    { tag: 'recipes/missing-item' },
  );
  check(missingItem, {
    'receta con item inexistente responde 404': (res) => res.status === 404,
  });

  const removed = del(`/recipes/${payload.plateId}`, {
    tag: 'recipes/delete',
  });
  check(removed, {
    'eliminar receta responde 200': (res) => res.status === 200,
  });

  const afterDelete = get(`/recipes/${payload.plateId}`, {
    tag: 'recipes/get-after-delete',
  });
  check(afterDelete, {
    'receta eliminada responde 404': (res) => res.status === 404,
  });
}
