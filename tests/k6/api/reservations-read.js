import { check } from 'k6';
import { smokeOptions } from '../config/options.js';
import { get, json } from '../lib/http.js';

export const options = smokeOptions;

export default function () {
  const all = get('/reservations', { tag: 'reservations/list' });
  check(all, {
    'listar reservas responde 200': (res) => res.status === 200,
    'listar reservas devuelve arreglo': (res) => Array.isArray(json(res)),
  });

  const pending = get('/reservations?status=pending&limit=10', {
    tag: 'reservations/filter-status',
  });
  check(pending, {
    'filtrar reservas pendientes responde 200': (res) => res.status === 200,
    'filtrar reservas devuelve arreglo': (res) => Array.isArray(json(res)),
  });

  const limited = get('/reservations?limit=5', {
    tag: 'reservations/filter-limit',
  });
  check(limited, {
    'limitar reservas responde 200': (res) => res.status === 200,
    'limitar reservas respeta el máximo': (res) => {
      const body = json(res);
      return Array.isArray(body) && body.length <= 5;
    },
  });

  const invalidStatus = get('/reservations?status=no-existe', {
    tag: 'reservations/invalid-status',
  });
  check(invalidStatus, {
    'estado inválido responde 400': (res) => res.status === 400,
  });

  const summary = get('/reservations/pending/summary', {
    tag: 'reservations/pending-summary',
  });
  check(summary, {
    'resumen pendiente responde 200': (res) => res.status === 200,
    'resumen pendiente devuelve arreglo': (res) => Array.isArray(json(res)),
  });

  const missing = get('/reservations/k6-orden-inexistente', {
    tag: 'reservations/missing',
  });
  check(missing, {
    'reserva inexistente responde 404': (res) => res.status === 404,
  });
}
