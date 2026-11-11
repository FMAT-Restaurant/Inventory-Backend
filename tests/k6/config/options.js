import {
  EVENT_P95_MS,
  HTTP_P95_MS,
  HTTP_P99_MS,
  MAX_ERROR_RATE,
} from './env.js';

const httpThresholds = {
  http_req_failed: [`rate<${MAX_ERROR_RATE}`],
  http_req_duration: [`p(95)<${HTTP_P95_MS}`, `p(99)<${HTTP_P99_MS}`],
  checks: ['rate>0.99'],
};

export const smokeOptions = {
  vus: 1,
  iterations: 5,
  thresholds: httpThresholds,
  tags: { suite: 'smoke' },
};

export const apiLoadOptions = {
  scenarios: {
    reads: {
      executor: 'constant-arrival-rate',
      exec: 'readScenario',
      rate: 20,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      tags: { workload: 'read' },
    },
    writes: {
      executor: 'ramping-vus',
      exec: 'writeScenario',
      startVUs: 1,
      stages: [
        { duration: '15s', target: 5 },
        { duration: '30s', target: 10 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
      tags: { workload: 'write' },
    },
  },
  thresholds: httpThresholds,
  tags: { suite: 'api-load' },
};

export const eventsOptions = {
  vus: 1,
  iterations: 5,
  thresholds: Object.assign({}, httpThresholds, {
    // En pruebas de eventos el HTTP incluye el polling de verificación; el
    // indicador relevante es event_processing_ms. Se evalúa p(95) y no p(99)
    // para no penalizar una consulta de sondeo aislada.
    http_req_duration: [`p(95)<${HTTP_P95_MS}`],
    event_processing_ms: [`p(95)<${EVENT_P95_MS}`],
  }),
  tags: { suite: 'events' },
};
