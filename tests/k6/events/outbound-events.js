import { check } from 'k6';
import { POLL_TIMEOUT_MS } from '../config/env.js';
import { eventsOptions } from '../config/options.js';
import {
  bindQueue,
  connect,
  declareExchange,
  declareQueue,
  deleteQueue,
  inspectQueue,
  listenUntil,
  publish,
} from '../lib/amqp.js';
import { orderEvent, recipePayload, uniqueSuffix } from '../lib/data.js';
import { json, post, poll } from '../lib/http.js';
import { eventProcessing } from '../lib/metrics.js';
import { seedCatalog } from '../lib/setup.js';

export const options = eventsOptions;

export function setup() {
  return seedCatalog({ items: 1, batchQuantity: 100, withRecipe: true });
}

function parseMessage(message) {
  try {
    return JSON.parse(message);
  } catch (error) {
    return null;
  }
}

export default function (data) {
  connect();
  declareExchange('ordenes.topic');
  declareExchange('inventory.topic');

  const suffix = uniqueSuffix();
  const reservationQueue = `k6-reservation-events-${suffix}`;
  const availabilityQueue = `k6-availability-events-${suffix}`;
  const itemId = data.items[0].id;

  declareQueue(reservationQueue);
  bindQueue(reservationQueue, 'inventory.topic', 'inventory.reservation.*');

  declareQueue(availabilityQueue);
  bindQueue(
    availabilityQueue,
    'inventory.topic',
    'inventory.recipe.availability-changed',
  );

  const orderId = `K6-OUTBOUND-${suffix}`;
  publish(
    'ordenes.topic',
    'ordenes.order.created',
    orderEvent({
      eventId: `K6-OUTBOUND-EVENT-${suffix}`,
      orderId,
      items: [{ itemId, quantity: 1 }],
    }),
  );

  const reservationReceived = poll(
    () => inspectQueue(reservationQueue),
    (queue) => Boolean(queue) && Number(queue.messages) >= 1,
    { timeout: POLL_TIMEOUT_MS },
  );
  check(reservationReceived, {
    'inventory publica evento de reserva': (result) => result.ok,
  });
  eventProcessing.add(reservationReceived.elapsed);

  const reservationMessage = listenUntil(
    reservationQueue,
    (raw) => {
      const payload = parseMessage(raw);
      return Boolean(payload) && payload.orderId === orderId;
    },
    { timeout: POLL_TIMEOUT_MS },
  );
  const reservationPayload = parseMessage(reservationMessage);
  check(reservationPayload, {
    'evento de reserva tiene orderId': (payload) =>
      Boolean(payload) && payload.orderId === orderId,
    'evento de reserva tiene status': (payload) =>
      Boolean(payload) && Boolean(payload.status),
    'evento de reserva tiene timestamp': (payload) =>
      Boolean(payload) && Boolean(payload.timestamp),
  });

  const recipePayloadBody = recipePayload([itemId]);
  const created = post('/recipes', recipePayloadBody, {
    tag: 'outbound/recipes-create',
  });
  check(created, {
    'crear receta responde 200/201': (res) => [200, 201].includes(res.status),
  });

  const availabilityReceived = poll(
    () => inspectQueue(availabilityQueue),
    (queue) => Boolean(queue) && Number(queue.messages) >= 1,
    { timeout: POLL_TIMEOUT_MS },
  );
  check(availabilityReceived, {
    'inventory publica availability-changed': (result) => result.ok,
  });
  eventProcessing.add(availabilityReceived.elapsed);

  const availabilityMessage = listenUntil(
    availabilityQueue,
    (raw) => {
      const payload = parseMessage(raw);
      return (
        Boolean(payload) && payload.plateId === recipePayloadBody.plateId
      );
    },
    { timeout: POLL_TIMEOUT_MS },
  );
  const availabilityPayload = parseMessage(availabilityMessage);
  check(availabilityPayload, {
    'availability-changed tiene plateId': (payload) =>
      Boolean(payload) && payload.plateId === recipePayloadBody.plateId,
    'availability-changed tiene isAvailable': (payload) =>
      Boolean(payload) && typeof payload.isAvailable === 'boolean',
    'availability-changed tiene timestamp': (payload) =>
      Boolean(payload) && Boolean(payload.timestamp),
  });

  deleteQueue(reservationQueue);
  deleteQueue(availabilityQueue);
}
