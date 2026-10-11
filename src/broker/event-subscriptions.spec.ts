import { describe, expect, it } from 'vitest';
import { EventSubscriptions } from './event-subscriptions.js';

describe('EventSubscriptions', () => {
  it('registra suscripciones y las expone en "all"', () => {
    const handler = () => undefined;
    const subscriptions = new EventSubscriptions()
      .on('inventory.topic', 'ingredient.created', handler)
      .on('inventory.topic', 'batch.#', handler);

    expect(subscriptions.all).toHaveLength(2);
    expect(subscriptions.all[0]).toMatchObject({
      exchange: 'inventory.topic',
      routingKey: 'ingredient.created',
      handler,
    });
  });

  it('lanza error si se suscribe dos veces al mismo evento', () => {
    const subscriptions = new EventSubscriptions().on(
      'inventory.topic',
      'ingredient.created',
      () => undefined,
    );

    expect(() =>
      subscriptions.on('inventory.topic', 'ingredient.created', () => undefined),
    ).toThrow('Ya existe una suscripción');
  });

  it('hace match exacto con la routing key', () => {
    const subscriptions = new EventSubscriptions().on(
      'inventory.topic',
      'ingredient.created',
      () => undefined,
    );

    expect(subscriptions.matching('ingredient.created')).toHaveLength(1);
    expect(subscriptions.matching('ingredient.updated')).toHaveLength(0);
  });

  it('hace match con el comodín "*"', () => {
    const subscriptions = new EventSubscriptions().on(
      'inventory.topic',
      'ingredient.*',
      () => undefined,
    );

    expect(subscriptions.matching('ingredient.created')).toHaveLength(1);
    expect(subscriptions.matching('ingredient.created.something')).toHaveLength(
      0,
    );
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
    expect(subscriptions.matching('ingredient.created')).toHaveLength(0);
  });

  it('puede devolver múltiples handlers para el mismo mensaje', () => {
    const subscriptions = new EventSubscriptions()
      .on('inventory.topic', 'batch.#', () => undefined)
      .on('inventory.topic', 'batch.created', () => undefined);

    expect(subscriptions.matching('batch.created')).toHaveLength(2);
  });
});
