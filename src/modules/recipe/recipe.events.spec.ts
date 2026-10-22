import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import { RecipeEvents } from './recipe.events.js';
import { RecipeService } from './recipe.service.js';

describe('RecipeEvents', () => {
  let events: RecipeEvents;
  const consumeSubscriptions = vi.fn();
  const registerOrUpdate = vi.fn();

  async function subscribe() {
    await events.onModuleInit();
    const [subscriptions, queue] = consumeSubscriptions.mock.calls[0] as [
      EventSubscriptions,
      string,
    ];
    return { subscriptions, queue };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    consumeSubscriptions.mockResolvedValue(undefined);
    registerOrUpdate.mockResolvedValue({
      recipe: { plateId: 'P-1' },
      isNew: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipeEvents,
        {
          provide: EventConsumer,
          useValue: { consumeSubscriptions },
        },
        {
          provide: RecipeService,
          useValue: { registerOrUpdate },
        },
      ],
    }).compile();
    events = module.get<RecipeEvents>(RecipeEvents);
  });

  it('registra una receta a partir del evento de platillo creado', async () => {
    const { subscriptions, queue } = await subscribe();
    expect(queue).toBe('cola_recipe_events');
    expect(subscriptions.all.map(({ routingKey }) => routingKey)).toEqual([
      'menu.plate.created',
      'menu.plate.updated',
      'menu.plate.deleted',
    ]);

    const created = subscriptions.matching('menu.plate.created')[0].handler;
    await created({
      plateId: 'P-1',
      name: 'Hamburguesa',
      items: [{ ingredientId: 'I-1', requiredQuantity: 2 }],
      timestamp: '2026-10-22T00:00:00Z',
    });

    expect(registerOrUpdate).toHaveBeenCalledWith({
      plateId: 'P-1',
      name: 'Hamburguesa',
      items: [{ ingredientId: 'I-1', requiredQuantity: 2 }],
    });
  });

  it.each([
    {},
    { name: 'Platillo', items: [{ ingredientId: 'I-1' }] },
    { plateId: 'P-1', items: [{ ingredientId: 'I-1' }] },
    { plateId: 'P-1', name: 'Platillo', items: [] },
    { plateId: 'P-1', name: 'Platillo', items: 'no es arreglo' },
  ])('ignora un evento de creación incompleto: %j', async (payload) => {
    const { subscriptions } = await subscribe();
    await subscriptions.matching('menu.plate.created')[0].handler(payload);
    expect(registerOrUpdate).not.toHaveBeenCalled();
  });

  it('no impide la suscripción del módulo cuando el broker falla', async () => {
    consumeSubscriptions.mockRejectedValueOnce(new Error('Broker caído'));
    await expect(events.onModuleInit()).resolves.toBeUndefined();
  });

  it('los eventos de actualización y eliminación aún no modifican recetas', async () => {
    const { subscriptions } = await subscribe();
    await subscriptions
      .matching('menu.plate.updated')[0]
      .handler({ plateId: 'P-1' });
    await subscriptions
      .matching('menu.plate.deleted')[0]
      .handler({ plateId: 'P-1' });
    expect(registerOrUpdate).not.toHaveBeenCalled();
  });

  it('maneja el fallo al registrar una receta sin propagarlo', async () => {
    registerOrUpdate.mockRejectedValueOnce(
      new Error('Ingrediente inexistente'),
    );
    const { subscriptions } = await subscribe();
    await expect(
      subscriptions.matching('menu.plate.created')[0].handler({
        plateId: 'P-1',
        name: 'Platillo',
        items: [{ ingredientId: 'I-1', requiredQuantity: 1 }],
      }),
    ).resolves.toBeUndefined();
  });
});
