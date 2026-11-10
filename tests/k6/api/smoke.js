import { check } from 'k6';
import { smokeOptions } from '../config/options.js';
import { get, json } from '../lib/http.js';

export const options = smokeOptions;

export default function () {
  const health = get('/', { tag: 'health' });
  check(health, {
    'health responde 200': (res) => res.status === 200,
    'health devuelve Hello World!': (res) =>
      String(res.body).includes('Hello World!'),
  });

  const items = get('/items', { tag: 'items/list' });
  check(items, {
    'items responde 200': (res) => res.status === 200,
    'items devuelve arreglo': (res) => Array.isArray(json(res)),
  });

  const recipes = get('/recipes', { tag: 'recipes/list' });
  check(recipes, {
    'recipes responde 200': (res) => res.status === 200,
    'recipes devuelve arreglo': (res) => Array.isArray(json(res)),
  });

  const reservations = get('/reservations/pending/summary', {
    tag: 'reservations/pending-summary',
  });
  check(reservations, {
    'pending summary responde 200': (res) => res.status === 200,
    'pending summary devuelve arreglo': (res) => Array.isArray(json(res)),
  });

  const movements = get('/movements', { tag: 'movements/list' });
  check(movements, {
    'movements responde 200': (res) => res.status === 200,
    'movements devuelve arreglo': (res) => Array.isArray(json(res)),
  });
}
