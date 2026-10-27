import { describe, expect, it } from 'vitest';
import { EventSubscriptions } from './event-subscriptions.js';

describe('EventSubscriptions', () => {
  it('registra suscripciones y las expone en "all"', () => {
    const handler = () => undefined;
    const subscriptions = new EventSubscriptions()
      .on('inventory.topic', 'item.created', handler)
      .on('inventory.topic', 'batch.#', handler);

    expect(subscriptions.all).toHaveLength(2);
    expect(subscriptions.all[0]).toMatchObject({
      exchange: 'inventory.topic',
      routingKey: 'item.created',
      handler,
    });
  });

  it('lanza error si se suscribe dos veces al mismo evento', () => {
    const subscriptions = new EventSubscriptions().on(
      'inventory.topic',
      'item.created',
      () => undefined,
    );

    expect(() =>
      subscriptions.on('inventory.topic', 'item.created', () => undefined),
    ).toThrow('Ya existe una suscripción');
  });

  it('hace match exacto con la routing key', () => {
    const subscriptions = new EventSubscriptions().on(
      'inventory.topic',
      'item.created',
      () => undefined,
    );

    expect(subscriptions.matching('item.created')).toHaveLength(1);
    expect(subscriptions.matching('item.updated')).toHaveLength(0);
  });

  it('hace match con el comodín "*"', () => {
    const subscriptions = new EventSubscriptions().on(
      'inventory.topic',
      'item.*',
      () => undefined,
    );

    expect(subscriptions.matching('item.created')).toHaveLength(1);
    expect(subscriptions.matching('item.created.something')).toHaveLength(0);
  });

  it('hace match con el comodín "#"', () => {
    const subscriptions = new EventSubscriptions().on(
      'inventory.topic',
      'batch.#',
      () => undefined,
    );

    expect(subscriptions.matching('batch')).toHaveLength(1);
    expect(subscriptions.matching('batch.created')).toHaveLength(1);
    expect(subscriptions.matching('batch.created.detail')).toHaveLength(1);
    expect(subscriptions.matching('item.created')).toHaveLength(0);
  });

  it('puede devolver múltiples handlers para el mismo mensaje', () => {
    const subscriptions = new EventSubscriptions()
      .on('inventory.topic', 'batch.#', () => undefined)
      .on('inventory.topic', 'batch.created', () => undefined);

    expect(subscriptions.matching('batch.created')).toHaveLength(2);
  });

  it('combina suscripciones con merge() omitiendo duplicados', () => {
    const base = new EventSubscriptions().on(
      'inventory.topic',
      'item.created',
      () => undefined,
    );

    const extra = new EventSubscriptions()
      .on('inventory.topic', 'item.created', () => undefined)
      .on('inventory.topic', 'batch.created', () => undefined);

    base.merge(extra);

    expect(base.all).toHaveLength(2);
    expect(base.matching('batch.created')).toHaveLength(1);
  });
});
