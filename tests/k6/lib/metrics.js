import { Counter, Trend } from 'k6/metrics';

export const eventProcessing = new Trend('event_processing_ms', true);
export const eventFailures = new Counter('event_failures');
export const checksFailed = new Counter('checks_failed');
