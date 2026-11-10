import { check, sleep } from 'k6';
import { POLL_TIMEOUT_MS } from '../config/env.js';
import { eventsOptions } from '../config/options.js';
import {
  connect,
  declareExchange,
  publish,
} from '../lib/amqp.js';
import { orderEvent, uniqueSuffix } from '../lib/data.js';
import { get, json, poll } from '../lib/http.js';
import { eventProcessing } from '../lib/metrics.js';
import { seedCatalog } from '../lib/setup.js';

export const options = eventsOptions;

export function setup() {
  return seedCatalog({ items: 1, batchQuantity: 100, withRecipe: false });
}

function itemStock(itemId) {
  const res = get(`/items/${itemId}`, { tag: 'orders/item-stock' });
  return res.status === 200 ? json(res) : null;
}

function pollReservation(orderId, tag) {
  return poll(
    () => get(`/reservations/${orderId}`, { tag }),
    (res) => res.status === 200,
    { timeout: POLL_TIMEOUT_MS },
  );
}

function reservationStatus(orderId, tag) {
  const res = get(`/reservations/${orderId}`, { tag });
  return res.status === 200 ? json(res) : null;
}

export default function (data) {
  connect();
  declareExchange('ordenes.topic');
  declareExchange('inventory.topic');

  const suffix = uniqueSuffix();
  const itemId = data.items[0].id;

  const quantity = 5;
  const orderId = `K6-ORDER-${suffix}`;
  const eventId = `K6-EVENT-${suffix}`;
  const stockBefore = itemStock(itemId);

  publish(
    'ordenes.topic',
    'ordenes.order.created',
    orderEvent({
      eventId,
      orderId,
      items: [{ itemId, quantity }],
    }),
  );

  const reserved = pollReservation(orderId, 'orders/reservation-pending');
  const reservedBody = reserved.ok ? json(reserved.value) : null;
  check(reserved, {
    'order.created crea reserva pendiente': (result) =>
      result.ok && Boolean(reservedBody) && reservedBody.status === 'pending',
  });
  eventProcessing.add(reserved.elapsed);

  const stockAfterReserve = itemStock(itemId);
  check(stockAfterReserve, {
    'order.created incrementa reservedStock': (item) =>
      Boolean(item) &&
      Boolean(stockBefore) &&
      Number(item.reservedStock) >=
        Number(stockBefore.reservedStock || 0) + quantity,
  });

  sleep(1);
  publish(
    'ordenes.topic',
    'ordenes.order.created',
    orderEvent({
      eventId,
      orderId,
      items: [{ itemId, quantity }],
    }),
  );
  sleep(1);

  const stockAfterDuplicate = itemStock(itemId);
  check(stockAfterDuplicate, {
    'evento duplicado no duplica la reserva': (item) =>
      Boolean(item) &&
      Boolean(stockAfterReserve) &&
      Number(item.reservedStock) === Number(stockAfterReserve.reservedStock),
  });

  publish(
    'ordenes.topic',
    'ordenes.order.confirmed',
    orderEvent({
      eventId: `${eventId}-CONFIRM`,
      orderId,
    }),
  );

  const confirmed = poll(
    () => {
      const body = reservationStatus(orderId, 'orders/reservation-confirmed');
      return { status: body && body.status, body };
    },
    (result) => result.status === 'confirmed',
    { timeout: POLL_TIMEOUT_MS },
  );
  check(confirmed, {
    'order.confirmed confirma la reserva': (result) => result.ok,
  });
  eventProcessing.add(confirmed.elapsed);

  const cancelOrderId = `K6-CANCEL-${suffix}`;
  const cancelEventId = `K6-EVENT-CANCEL-${suffix}`;

  publish(
    'ordenes.topic',
    'ordenes.order.created',
    orderEvent({
      eventId: cancelEventId,
      orderId: cancelOrderId,
      items: [{ itemId, quantity }],
    }),
  );

  const pendingCancel = pollReservation(
    cancelOrderId,
    'orders/reservation-before-cancel',
  );
  check(pendingCancel, {
    'orden a cancelar queda pendiente': (result) => result.ok,
  });
  eventProcessing.add(pendingCancel.elapsed);

  publish(
    'ordenes.topic',
    'ordenes.order.cancelled',
    orderEvent({
      eventId: `${cancelEventId}-CANCEL`,
      orderId: cancelOrderId,
      reason: 'cancelación k6',
    }),
  );

  const released = poll(
    () => {
      const body = reservationStatus(cancelOrderId, 'orders/reservation-released');
      return { status: body && body.status, body };
    },
    (result) => result.status === 'released',
    { timeout: POLL_TIMEOUT_MS },
  );
  check(released, {
    'order.cancelled libera la reserva': (result) => result.ok,
  });
  eventProcessing.add(released.elapsed);

  const rejectOrderId = `K6-REJECT-${suffix}`;
  const rejectEventId = `K6-EVENT-REJECT-${suffix}`;
  const stockBeforeReject = itemStock(itemId);

  publish(
    'ordenes.topic',
    'ordenes.order.created',
    orderEvent({
      eventId: rejectEventId,
      orderId: rejectOrderId,
      items: [{ itemId, quantity: 999999 }],
    }),
  );
  sleep(1);

  const stockAfterReject = itemStock(itemId);
  check(stockAfterReject, {
    'reserva rechazada no modifica reservedStock': (item) =>
      Boolean(item) &&
      Boolean(stockBeforeReject) &&
      Number(item.reservedStock) ===
        Number(stockBeforeReject.reservedStock),
  });
}
