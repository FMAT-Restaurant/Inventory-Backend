import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import {
  DishRejectedEvent,
  ORDERS_EVENTS_QUEUE,
  ORDERS_EXCHANGES,
  OrderEvent,
  OrderEventItem,
  OrderWastedEvent,
  OrdersRoutingKeyAliases,
  OrdersRoutingKeys,
  WastedLine,
} from '../../broker/event-conventions.js';
import { ProcessedEventService } from '../processed-event/processed-event.service.js';
import { ReservationService } from './reservation.service.js';
import { RecipeService } from '../recipe/recipe.service.js';
import { WasteService } from './waste.service.js';

const CONSUMER_NAME = 'orders-events';

@Injectable()
export class OrdersEvents implements OnModuleInit {
  private readonly logger = new Logger(OrdersEvents.name);

  constructor(
    private readonly consumer: EventConsumer,
    private readonly reservationService: ReservationService,
    private readonly processedEvents: ProcessedEventService,
    private readonly recipeService: RecipeService,
    private readonly wasteService: WasteService,
  ) {}

  async onModuleInit(): Promise<void> {
    const handlers: Record<
      keyof typeof OrdersRoutingKeys,
      (payload: unknown) => Promise<void>
    > = {
      OrderCreated: (payload) => this.handleCreated(payload),
      OrderConfirmed: (payload) => this.handleConfirmed(payload),
      OrderCancelled: (payload) => this.handleCancelled(payload),
      OrderServed: (payload) => this.handleServed(payload),
      OrderExpired: (payload) => this.handleExpired(payload),
      OrderWasted: (payload) => this.handleWasted(payload),
      DishRejected: (payload) => this.handleDishRejected(payload),
    };

    // Órdenes emite cada evento con su clave en inglés y en español; se
    // suscriben ambas en cada exchange donde puede publicar.
    const subscriptions = new EventSubscriptions();
    for (const exchange of ORDERS_EXCHANGES) {
      for (const name of Object.keys(OrdersRoutingKeys) as Array<
        keyof typeof OrdersRoutingKeys
      >) {
        const keys = [
          OrdersRoutingKeys[name],
          ...OrdersRoutingKeyAliases[name],
        ];
        for (const routingKey of keys) {
          subscriptions.on(exchange, routingKey, handlers[name]);
        }
      }
    }

    try {
      await this.consumer.consumeSubscriptions(
        subscriptions,
        ORDERS_EVENTS_QUEUE,
        { durable: true },
      );
      this.logger.log(
        `✅ Suscrito a los eventos de órdenes en '${ORDERS_EXCHANGES.join("', '")}' (cola '${ORDERS_EVENTS_QUEUE}')`,
      );
    } catch (error) {
      // El consumidor conserva las suscripciones y reintenta reconectar.
      this.logger.error('❌ No se pudo suscribir a los eventos de órdenes:', error);
    }
  }

  private async handleCreated(payload: unknown): Promise<void> {
    const event = this.parseEvent(payload);
    if (!event || !event.items || event.items.length === 0) {
      this.logger.warn(
        `⚠️ Evento '${OrdersRoutingKeys.OrderCreated}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    if (await this.alreadyProcessed(event)) {
      return;
    }

    await this.reservationService.reserve({
      orderId: event.orderId,
      items: event.items,
      eventId: event.eventId,
      correlationId: event.correlationId,
    });
    await this.markProcessed(event);
  }

  private async handleConfirmed(payload: unknown): Promise<void> {
    const event = this.parseEvent(payload);
    if (!event) {
      this.logger.warn(
        `⚠️ Evento '${OrdersRoutingKeys.OrderConfirmed}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    if (await this.alreadyProcessed(event)) {
      return;
    }

    await this.reservationService.confirm(
      event.orderId,
      event.eventId,
      event.correlationId,
    );
    await this.markProcessed(event);
  }

  private async handleCancelled(payload: unknown): Promise<void> {
    const event = this.parseEvent(payload);
    if (!event) {
      this.logger.warn(
        `⚠️ Evento '${OrdersRoutingKeys.OrderCancelled}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    if (await this.alreadyProcessed(event)) {
      return;
    }

    await this.reservationService.release(
      event.orderId,
      undefined,
      event.reason ?? 'Orden cancelada',
      { eventId: event.eventId, correlationId: event.correlationId },
    );
    await this.markProcessed(event);
  }

  private async handleServed(payload: unknown): Promise<void> {
    const event = this.parseEvent(payload);
    if (!event) {
      this.logger.warn(
        `⚠️ Evento '${OrdersRoutingKeys.OrderServed}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    if (await this.alreadyProcessed(event)) {
      return;
    }

    try {
      await this.reservationService.consumeServedOrder({
        orderId: event.orderId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        items: event.items as any,
        reason: event.reason,
      });
      await this.markProcessed(event);
      this.logger.log(
        `✅ [Órdenes] Orden '${event.orderId}' servida procesada (consumo FEFO + movimientos registrados).`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error al procesar orden servida '${event.orderId}':`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private async handleExpired(payload: unknown): Promise<void> {
    const event = this.parseEvent(payload);
    if (!event) {
      this.logger.warn(
        `⚠️ Evento '${OrdersRoutingKeys.OrderExpired}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    if (await this.alreadyProcessed(event)) {
      return;
    }

    // Garantiza que no queden reservas huérfanas de una orden que expiró.
    await this.reservationService.release(
      event.orderId,
      undefined,
      event.reason ?? 'Orden expirada',
      { eventId: event.eventId, correlationId: event.correlationId },
    );
    await this.markProcessed(event);
  }

  private async handleWasted(payload: unknown): Promise<void> {
    const event = this.parseWastedEvent(payload);
    if (!event) {
      this.logger.warn(
        `⚠️ Evento '${OrdersRoutingKeys.OrderWasted}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    await this.runOnce(event, () => this.wasteService.registerOrderWaste(event));
  }

  private async handleDishRejected(payload: unknown): Promise<void> {
    const event = this.parseDishRejectedEvent(payload);
    if (!event) {
      this.logger.warn(
        `⚠️ Evento '${OrdersRoutingKeys.DishRejected}' con payload inválido. Se ignora: ${JSON.stringify(payload)}`,
      );
      return;
    }

    await this.runOnce(event, () => this.wasteService.handleDishRejected(event));
  }

  /**
   * Procesa un evento una sola vez aunque lleguen copias a la vez (Órdenes
   * emite cada evento con dos claves). Si falla, se libera para reintentar.
   */
  private async runOnce(
    event: { eventId: string; orderId: string },
    work: () => Promise<unknown>,
  ): Promise<void> {
    const claimed = await this.processedEvents.claim(
      CONSUMER_NAME,
      event.eventId,
    );
    if (!claimed) {
      this.logger.log(
        `🔁 Evento '${event.eventId}' ya procesado para la orden '${event.orderId}'.`,
      );
      return;
    }

    try {
      await work();
    } catch (error) {
      await this.processedEvents.release(CONSUMER_NAME, event.eventId);
      throw error;
    }
  }

  private parseWastedEvent(payload: unknown): OrderWastedEvent | null {
    if (!this.isRecord(payload)) {
      return null;
    }
    const eventId = this.asNonEmptyString(payload.eventId);
    const orderId = this.asNonEmptyString(payload.orderId);
    if (!eventId || !orderId) {
      return null;
    }

    const rawLines = Array.isArray(payload.itemsAfectados)
      ? payload.itemsAfectados
      : Array.isArray(payload.items)
        ? payload.items
        : [];
    const lines: WastedLine[] = [];
    for (const raw of rawLines) {
      if (!this.isRecord(raw)) continue;
      const quantity = this.toPositiveQuantity(raw.quantity);
      if (quantity === null) continue;
      const plateId =
        this.getNonEmptyString(raw.plateId) ??
        this.getNonEmptyString(raw.sourceId);
      const offerId = this.getNonEmptyString(raw.offerId);
      if (!plateId && !offerId) continue;
      lines.push({ plateId, offerId, quantity });
    }
    if (lines.length === 0) {
      return null;
    }

    return {
      eventId,
      orderId,
      correlationId: this.asNonEmptyString(payload.correlationId),
      reason:
        this.asNonEmptyString(payload.reason) ??
        this.asNonEmptyString(payload.motivo) ??
        'Merma reportada por Órdenes',
      lines,
    };
  }

  private parseDishRejectedEvent(payload: unknown): DishRejectedEvent | null {
    if (!this.isRecord(payload)) {
      return null;
    }
    const eventId = this.asNonEmptyString(payload.eventId);
    const orderId = this.asNonEmptyString(payload.orderId);
    const quantity = this.toPositiveQuantity(payload.quantity);
    const plateId =
      this.getNonEmptyString(payload.plateId) ??
      this.getNonEmptyString(payload.sourceId);
    const offerId = this.getNonEmptyString(payload.offerId);
    if (!eventId || !orderId || quantity === null || (!plateId && !offerId)) {
      return null;
    }

    return {
      eventId,
      orderId,
      correlationId: this.asNonEmptyString(payload.correlationId),
      itemId: this.asNonEmptyString(payload.itemId),
      offerId,
      plateId,
      quantity,
      reason:
        this.asNonEmptyString(payload.reason) ??
        this.asNonEmptyString(payload.motivo) ??
        'Platillo rechazado por cocina',
    };
  }

  private parseEvent(payload: unknown): OrderEvent | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate = payload as Record<string, unknown>;
    const eventId = this.asNonEmptyString(candidate.eventId);
    const orderId = this.asNonEmptyString(candidate.orderId);
    if (!eventId || !orderId) {
      return null;
    }

    return {
      eventId,
      orderId,
      version: Number(candidate.version ?? 1),
      occurredAt:
        typeof candidate.occurredAt === 'string'
          ? candidate.occurredAt
          : new Date().toISOString(),
      correlationId: this.asNonEmptyString(candidate.correlationId),
      reason: this.asNonEmptyString(candidate.reason),
      items: this.parseItems(candidate.items),
    };
  }

  private parseItems(value: unknown): OrderEventItem[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const items = value
      .map((raw) => this.parseItem(raw))
      .filter((item): item is OrderEventItem => item !== null);

    return items.length > 0 ? items : undefined;
  }

  private parseItem(raw: unknown): OrderEventItem | null {
    if (!this.isRecord(raw)) {
      return null;
    }

    const quantity = this.toPositiveQuantity(raw.quantity);
    if (quantity === null) {
      return null;
    }

    // `plateId` (Inventario) y `sourceId` (Menú) son la misma receta.
    const plateId =
      this.getNonEmptyString(raw.plateId) ??
      this.getNonEmptyString(raw.sourceId);
    if (plateId) {
      const offerId = this.getNonEmptyString(raw.offerId);
      return {
        plateId,
        quantity,
        ...(offerId ? { offerId } : {}),
      } as OrderEventItem;
    }

    const itemIdDirect = this.getNonEmptyString(raw.itemId);
    if (itemIdDirect) {
      // TODO: mantener por compatibilidad si Órdenes envía itemId directamente
      return { itemId: itemIdDirect, quantity } as OrderEventItem;
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private toPositiveQuantity(value: unknown): number | null {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }
    return quantity;
  }

  private asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private async alreadyProcessed(event: { eventId: string; orderId: string }): Promise<boolean> {
    const processed = await this.processedEvents.isProcessed(
      CONSUMER_NAME,
      event.eventId,
    );
    if (processed) {
      this.logger.log(
        `🔁 Evento '${event.eventId}' ya procesado para la orden '${event.orderId}'.`,
      );
    }
    return processed;
  }

  private async markProcessed(event: { eventId: string }): Promise<void> {
    await this.processedEvents.markProcessed(CONSUMER_NAME, event.eventId);
  }
}
