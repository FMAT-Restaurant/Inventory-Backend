import { sleep } from 'k6';
import Amqp from 'k6/x/amqp';
import Exchange from 'k6/x/amqp/exchange';
import Queue from 'k6/x/amqp/queue';
import { RABBITMQ_URL } from '../config/env.js';

let connectionId = 0;
const messageBuffers = new Map();

export function connect() {
  if (connectionId === 0) {
    connectionId = Amqp.start({ connection_url: RABBITMQ_URL });
  }
  return connectionId;
}

export function declareExchange(name, kind = 'topic', durable = true) {
  connect();
  Exchange.declare({
    connection_id: connectionId,
    name,
    kind,
    durable,
  });
}

export function declareQueue(name, durable = false) {
  connect();
  return Queue.declare({
    connection_id: connectionId,
    name,
    durable,
    // Sin auto-delete: `Amqp.listen` cierra su canal al retornar y la cola
    // desaparecería antes de poder inspeccionarla/eliminarla explícitamente.
    delete_when_unused: false,
    exclusive: false,
  });
}

export function bindQueue(queueName, exchangeName, routingKey) {
  connect();
  Queue.bind({
    connection_id: connectionId,
    queue_name: queueName,
    exchange_name: exchangeName,
    routing_key: routingKey,
  });
}

export function deleteQueue(name) {
  connect();
  Queue.delete(name, { connection_id: connectionId });
}

export function purgeQueue(name) {
  connect();
  return Queue.purge(name, false, { connection_id: connectionId });
}

export function inspectQueue(name) {
  connect();
  return Queue.inspect(name, { connection_id: connectionId });
}

/**
 * En xk6-amqp, cuando se publica a un exchange, el campo `queue_name`
 * se usa como routing key (PublishWithContext(exchange, routingKey, ...)).
 */
export function publish(exchange, routingKey, payload) {
  connect();
  Amqp.publish({
    connection_id: connectionId,
    exchange,
    queue_name: routingKey,
    body: JSON.stringify(payload),
    content_type: 'application/json',
    persistent: true,
  });
}

function bufferFor(queueName) {
  if (!messageBuffers.has(queueName)) {
    messageBuffers.set(queueName, []);
  }
  return messageBuffers.get(queueName);
}

function startListener(queueName) {
  connect();
  const buffer = bufferFor(queueName);

  Amqp.listen({
    connection_id: connectionId,
    queue_name: queueName,
    auto_ack: true,
    listener: (message) => {
      buffer.push(message);
    },
  });
}

/**
 * Lectura de un solo mensaje. La extensión archivada ejecuta el listener
 * desde una goroutine y cierra el canal al retornar, por lo que se conserva
 * un buffer por cola y se reintenta la escucha hasta recibir algo.
 * Debe usarse en escenarios de 1 sola VU.
 */
export function listenOnce(queueName, timeoutMs = 2000) {
  const buffer = bufferFor(queueName);
  if (buffer.length > 0) {
    return buffer.shift();
  }

  const startedAt = Date.now();
  startListener(queueName);

  while (Date.now() - startedAt < timeoutMs) {
    if (buffer.length > 0) {
      return buffer.shift();
    }
    sleep(0.1);
  }

  return buffer.length > 0 ? buffer.shift() : null;
}

export function listenUntil(queueName, predicate, options = {}) {
  const timeout = options.timeout || 10000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const remaining = timeout - (Date.now() - startedAt);
    const message = listenOnce(queueName, Math.min(1000, Math.max(100, remaining)));

    if (!message) {
      continue;
    }

    if (predicate(message)) {
      return message;
    }
  }

  return null;
}
