import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  AUTH_TOKEN,
  BASE_URL,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
} from '../config/env.js';

export function buildHeaders(extra = {}) {
  const headers = Object.assign(
    {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    extra,
  );

  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }

  return headers;
}

// Las suites prueban a propósito 400/404/409 (validación, no encontrado,
// duplicado). Se marcan como esperados para que `http_req_failed` solo cuente
// errores reales (por ejemplo 5xx).
const expectedStatuses = http.expectedStatuses(200, 201, 204, 400, 404, 409);

export function request(method, path, body, options = {}) {
  const url = `${BASE_URL}${path}`;
  const params = Object.assign({}, options);

  params.responseCallback = options.responseCallback || expectedStatuses;
  params.headers = buildHeaders(options.headers);
  params.tags = Object.assign(
    { endpoint: options.tag || path },
    options.tags || {},
  );

  delete params.tag;

  return http.request(
    method,
    url,
    body === undefined ? null : JSON.stringify(body),
    params,
  );
}

export function get(path, options = {}) {
  return request('GET', path, undefined, options);
}

export function post(path, body, options = {}) {
  return request('POST', path, body, options);
}

export function patch(path, body, options = {}) {
  return request('PATCH', path, body, options);
}

export function del(path, options = {}) {
  return request('DELETE', path, undefined, options);
}

export function json(res) {
  try {
    return res.json();
  } catch (error) {
    return null;
  }
}

export function expectStatus(res, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  return check(res, {
    [`${label} -> ${statuses.join('|')}`]: (response) =>
      statuses.includes(response.status),
  });
}

export function poll(fn, predicate, options = {}) {
  const timeout = options.timeout || POLL_TIMEOUT_MS;
  const interval = options.interval || POLL_INTERVAL_MS;
  const startedAt = Date.now();
  let value = null;

  while (Date.now() - startedAt < timeout) {
    value = fn();
    if (predicate(value)) {
      return { ok: true, value, elapsed: Date.now() - startedAt };
    }
    sleep(interval / 1000);
  }

  return { ok: false, value, elapsed: Date.now() - startedAt };
}
