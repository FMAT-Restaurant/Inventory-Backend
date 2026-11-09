import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import { RecipeEvents } from './recipe.events.js';
import { RecipeService } from './recipe.service.js';

describe('RecipeEvents', () => {
  let events: RecipeEvents;
  const consumeSubscriptions = vi.fn();
  const registerOrUpdate = vi.fn();
  const remove = vi.fn();

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
    remove.mockResolvedValue(undefined);
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
          useValue: { registerOrUpdate, remove },
        },
      ],
    }).compile();
    events = module.get<RecipeEvents>(RecipeEvents);
  });

  it('registra una receta a partir del evento de platillo creado', async () => {
    const { subscriptions, queue } = await subscribe();
    expect(queue).toBe('cola_recipe_events');
    expect(subscriptions.all.map(({ routingKey }) => routingKey)).toEqual([
      'menu.source.created',
      'menu.source.updated',
      'menu.source.deleted',
    ]);

    const created = subscriptions.matching('menu.source.created')[0].handler;
    await created({
      sourceId: 'P-1',
      name: 'Hamburguesa',
      sourceType: 'RECIPE',
      items: [{ id: 'I-1', quantity: 2 }],
    });

    expect(registerOrUpdate).toHaveBeenCalledWith({
      plateId: 'P-1',
      name: 'Hamburguesa',
      items: [{ itemId: 'I-1', requiredQuantity: 2 }],
    });
  });

  it.each([
    {},
    { name: 'Platillo', items: [{ id: 'I-1', quantity: 1 }] },
    { sourceId: 'P-1', items: [{ id: 'I-1', quantity: 1 }] },
    { sourceId: 'P-1', name: 'Platillo', items: [] },
    { sourceId: 'P-1', name: 'Platillo', items: 'no es arreglo' },
  ])('ignora un evento de creación incompleto: %j', async (payload) => {
    const { subscriptions } = await subscribe();
    await subscriptions.matching('menu.source.created')[0].handler(payload);
    expect(registerOrUpdate).not.toHaveBeenCalled();
  });

  it('no impide la suscripción del módulo cuando el broker falla', async () => {
    consumeSubscriptions.mockRejectedValueOnce(new Error('Broker caído'));
    await expect(events.onModuleInit()).resolves.toBeUndefined();
  });

  it('menu.source.updated sincroniza la receta', async () => {
    const { subscriptions } = await subscribe();
    await subscriptions.matching('menu.source.updated')[0].handler({
      sourceId: 'P-1',
      name: 'Hamburguesa doble',
      items: [{ id: 'I-1', quantity: 3 }],
    });
    expect(registerOrUpdate).toHaveBeenCalledWith({
      plateId: 'P-1',
      name: 'Hamburguesa doble',
      items: [{ itemId: 'I-1', requiredQuantity: 3 }],
    });
  });

  it('menu.source.updated ignora payloads incompletos', async () => {
    const { subscriptions } = await subscribe();
    await subscriptions
      .matching('menu.source.updated')[0]
      .handler({ sourceId: 'P-1' });
    expect(registerOrUpdate).not.toHaveBeenCalled();
  });

  it('menu.source.deleted elimina la receta', async () => {
    const { subscriptions } = await subscribe();
    await subscriptions
      .matching('menu.source.deleted')[0]
      .handler({ sourceId: 'P-1' });
    expect(remove).toHaveBeenCalledWith('P-1');
  });

  it('menu.source.deleted ignora recetas inexistentes y payloads vacíos', async () => {
    remove.mockRejectedValueOnce(new NotFoundException());
    const { subscriptions } = await subscribe();
    const deleted = subscriptions.matching('menu.source.deleted')[0].handler;
    await expect(deleted({ sourceId: 'X' })).resolves.toBeUndefined();
    await expect(deleted({})).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('maneja el fallo al registrar una receta sin propagarlo', async () => {
    registerOrUpdate.mockRejectedValueOnce(new Error('Item inexistente'));
    const { subscriptions } = await subscribe();
    await expect(
      subscriptions.matching('menu.source.created')[0].handler({
        sourceId: 'P-1',
        name: 'Platillo',
        items: [{ id: 'I-1', quantity: 1 }],
      }),
    ).resolves.toBeUndefined();
  });

  it('menu.source.created indica que la receta se actualizó cuando ya existía', async () => {
    registerOrUpdate.mockResolvedValueOnce({
      recipe: { plateId: 'P-1' },
      isNew: false,
    });
    const { subscriptions } = await subscribe();
    await subscriptions.matching('menu.source.created')[0].handler({
      sourceId: 'P-1',
      name: 'Platillo',
      items: [{ id: 'I-1', quantity: 1 }],
    });
    expect(registerOrUpdate).toHaveBeenCalledTimes(1);
  });

  it('menu.source.updated crea la receta si no existía (isNew: true)', async () => {
    registerOrUpdate.mockResolvedValueOnce({
      recipe: { plateId: 'P-1' },
      isNew: true,
    });
    const { subscriptions } = await subscribe();
    await subscriptions.matching('menu.source.updated')[0].handler({
      sourceId: 'P-1',
      name: 'Platillo',
      items: [{ id: 'I-1', quantity: 1 }],
    });
    expect(registerOrUpdate).toHaveBeenCalledTimes(1);
  });

  it('menu.source.updated maneja el fallo al guardar sin propagarlo', async () => {
    registerOrUpdate.mockRejectedValueOnce(new Error('Item inexistente'));
    const { subscriptions } = await subscribe();
    await expect(
      subscriptions.matching('menu.source.updated')[0].handler({
        sourceId: 'P-1',
        name: 'Platillo',
        items: [{ id: 'I-1', quantity: 1 }],
      }),
    ).resolves.toBeUndefined();
  });

  it('menu.source.updated maneja errores que no son instancia de Error', async () => {
    registerOrUpdate.mockRejectedValueOnce('fallo como texto');
    const { subscriptions } = await subscribe();
    await expect(
      subscriptions.matching('menu.source.updated')[0].handler({
        sourceId: 'P-1',
        name: 'Platillo',
        items: [{ id: 'I-1', quantity: 1 }],
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    [null],
    [undefined],
    ['texto plano'],
    [{ name: 'Platillo', items: [{ id: 'I-1', quantity: 1 }] }],
    [{ sourceId: 'P-1', name: 'Platillo', items: [{ quantity: 1 }] }],
    [{ sourceId: 'P-1', name: 'Platillo', items: [{ id: 'I-1' }] }],
    [
      {
        sourceId: 'P-1',
        name: 'Platillo',
        items: [{ id: 'I-1', quantity: 0 }],
      },
    ],
  ])('menu.source.updated rechaza el payload inválido: %j', async (payload) => {
    const { subscriptions } = await subscribe();
    await expect(
      subscriptions.matching('menu.source.updated')[0].handler(payload),
    ).resolves.toBeUndefined();
    expect(registerOrUpdate).not.toHaveBeenCalled();
  });

  it('menu.source.deleted maneja errores inesperados sin propagarlos', async () => {
    remove.mockRejectedValueOnce(new Error('Mongo caído'));
    const { subscriptions } = await subscribe();
    await expect(
      subscriptions
        .matching('menu.source.deleted')[0]
        .handler({ sourceId: 'P-1' }),
    ).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('P-1');
  });

  it('menu.source.updated actualiza una receta existente (isNew: false)', async () => {
    registerOrUpdate.mockResolvedValueOnce({
      recipe: { plateId: 'P-1' },
      isNew: false,
    });
    const { subscriptions } = await subscribe();
    await subscriptions.matching('menu.source.updated')[0].handler({
      sourceId: 'P-1',
      name: 'Platillo',
      items: [{ id: 'I-1', quantity: 1 }],
    });
    expect(registerOrUpdate).toHaveBeenCalledTimes(1);
  });
});
