const baseUrl =
  __ENV.K6_BASE_URL || __ENV.BASE_URL || 'http://localhost:8083';

export const BASE_URL = baseUrl.replace(/\/+$/, '');

export const RABBITMQ_URL =
  __ENV.K6_RABBITMQ_URL ||
  __ENV.RABBITMQ_URL ||
  'amqp://admin:supersecurepassword@localhost:5672';

export const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || '';

export const POLL_TIMEOUT_MS = Number(__ENV.K6_POLL_TIMEOUT_MS || 10000);
export const POLL_INTERVAL_MS = Number(__ENV.K6_POLL_INTERVAL_MS || 250);

export const HTTP_P95_MS = Number(__ENV.K6_HTTP_P95_MS || 500);
export const HTTP_P99_MS = Number(__ENV.K6_HTTP_P99_MS || 1000);
export const MAX_ERROR_RATE = Number(__ENV.K6_MAX_ERROR_RATE || 0.01);
export const EVENT_P95_MS = Number(__ENV.K6_EVENT_P95_MS || 2000);
