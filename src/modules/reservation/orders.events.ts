import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventConsumer } from '../../broker/event-customer.service.js';
import { EventSubscriptions } from '../../broker/event-subscriptions.js';
import {
  ORDERS_EVENTS_QUEUE,
  ORDERS_EXCHANGE,
  OrderEvent,
  OrderEventItem,
  OrdersRoutingKeys,
} from '../../broker/event-conventions.js';
import { ProcessedEventService } from '../processed-event/processed-event.service.js';
import { ReservationService } from './reservation.service.js';
import { RecipeService } from '../recipe/recipe.service.js';

const CONSUMER_NAME = 'orders-events';

@Injectable()
export class OrdersEvents implements OnModuleInit {
  private readonly logger = new Logger(OrdersEvents.name);

  constructor(
    private readonly consumer: EventConsumer,
    private readonly reservationService: ReservationService,
    private readonly processedEvents: ProcessedEventService,
    private readonly recipeService: RecipeService,
  ) {}

  async onModuleInit(): Promise<void> {
    const subscriptions = new EventSubscriptions()
      .on(ORDERS_EXCHANGE, OrdersRoutingKeys.OrderCreated, (payload) =>
        this.handleCreated(payload),
      )
      .on(ORDERS_EXCHANGE, OrdersRoutingKeys.OrderConfirmed, (payload) =>
        this.handleConfirmed(payload),
      )
      .on(ORDERS_EXCHANGE, OrdersRoutingKeys.OrderCancelled, (payload) =>
        this.handleCancelled(payload),
      )
      .on(ORDERS_EXCHANGE, OrdersRoutingKeys.OrderServed, (payload) =>
        this.handleServed(payload),
      );

    try {
      await this.consumer.consumeSubscriptions(
        subscriptions,
        ORDERS_EVENTS_QUEUE,
        { durable: true },
      );
      this.logger.log(
        `✅ Suscrito a los eventos de órdenes en '${ORDERS_EXCHANGE}' (cola '${ORDERS_EVENTS_QUEUE}')`,
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

    const plateId = this.getNonEmptyString(raw.plateId);
    if (plateId) {
      return { plateId, quantity } as OrderEventItem;
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

  private async alreadyProcessed(event: OrderEvent): Promise<boolean> {
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

  private async markProcessed(event: OrderEvent): Promise<void> {
    await this.processedEvents.markProcessed(CONSUMER_NAME, event.eventId);
  }
}
