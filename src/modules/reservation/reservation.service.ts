import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ItemService } from '../item/item.service.js';
import { Item } from '../item/schemas/item.schema.js';
import { EventPublisher } from '../../broker/event-publisher.service.js';
import {
  INVENTORY_EXCHANGE,
  InventoryRoutingKeys,
  OrderEventItem,
  ReservationResultEvent,
  ReservationResultItem,
} from '../../broker/event-conventions.js';
import { QueryReservationsDto } from './dto/query-reservations.dto.js';
import { ReservationCacheService } from './reservation-cache.service.js';
import {
  ACTIVE_RESERVATION_STATUSES,
  ReservationStatus,
  StockReservation,
} from './schemas/stock-reservation.schema.js';
import { RecipeService } from '../recipe/recipe.service.js';
import { BatchService } from '../batch/batch.service.js';
import { StockMovementService } from '../stock-movement/stock-movement.service.js';
import { Recipe } from '../recipe/schemas/recipe.schema.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;
const DEFAULT_TTL_MINUTES = 30;

export interface ReserveReservationInput {
  orderId: string;
  items: OrderEventItem[];
  eventId?: string;
  correlationId?: string;
  ttlMinutes?: number;
}

export interface PendingSummaryRow {
  itemId: string;
  reservedQuantity: number;
  reservationsCount: number;
}

interface AggregatedItem {
  itemId: string;
  quantity: number;
}

interface AggregatedItems {
  valid: AggregatedItem[];
  invalid: OrderEventItem[];
  /** plateIds sin receta registrada en Inventario. */
  missingRecipes: string[];
  /** plateIds cuya receta está incompleta (insumos inexistentes). */
  incompleteRecipes: string[];
}

type PlateExpansion =
  | 'INVALID'
  | 'NOT_FOUND'
  | 'INCOMPLETE'
  | Array<{ itemId: string; totalQty: number }>;

export const ReservationErrorCodes = {
  RecipeNotFound: 'RECIPE_NOT_FOUND',
  RecipeIncomplete: 'RECIPE_INCOMPLETE',
  InvalidItems: 'INVALID_ITEMS',
  InsufficientStock: 'INSUFFICIENT_STOCK',
  ReservationNotFound: 'RESERVATION_NOT_FOUND',
  ReservationNotActive: 'RESERVATION_NOT_ACTIVE',
  AlreadyServed: 'ALREADY_SERVED',
} as const;

export function resolveReservationTtlMinutes(): number {
  const configured = Number(process.env.RESERVATION_TTL_MINUTES);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_TTL_MINUTES;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function availableStockOf(item: Item): number {
  return Math.max(
    0,
    Number(item.totalStock ?? 0) - Number(item.reservedStock ?? 0),
  );
}

@Injectable()
export class ReservationService implements OnModuleInit {
  private readonly logger = new Logger(ReservationService.name);

  constructor(
    @InjectModel(StockReservation.name)
    private readonly reservationModel: Model<StockReservation>,
    @InjectModel(Recipe.name)
    private readonly recipeModel: Model<Recipe>,
    private readonly itemService: ItemService,
    private readonly cache: ReservationCacheService,
    private readonly publisher: EventPublisher,
    private readonly recipeService: RecipeService,
    private readonly batchService: BatchService,
    private readonly stockMovementService: StockMovementService,
  ) {}

  onModuleInit(): void {
    // Un item con reservas activas no puede darse de baja
    this.itemService.registerRemovalGuard((itemId) =>
      this.describeActiveReservationsOfItem(itemId),
    );
  }

  private async describeActiveReservationsOfItem(
    itemId: string,
  ): Promise<string | null> {
    const active = await this.reservationModel
      .countDocuments({
        status: { $in: [...ACTIVE_RESERVATION_STATUSES] },
        'items.itemId': new Types.ObjectId(itemId),
      })
      .exec();
    if (active === 0) {
      return null;
    }
    return `No se puede eliminar el item: tiene ${active} reserva(s) activa(s) de órdenes. Espera a que se sirvan, cancelen o expiren.`;
  }

  /**
   * Crea una reserva idempotente por `orderId`. Si no hay stock suficiente no
   * deja cambios parciales y publica un evento de rechazo.
   */
  async reserve(
    input: ReserveReservationInput,
  ): Promise<StockReservation | null> {
    const orderId = this.normalizeOrderId(input.orderId);
    if (!orderId) {
      await this.publishRejected('', [], 'orderId es obligatorio');
      return null;
    }

    const existing = await this.getExistingOrExpire(orderId);
    if (existing === 'EXPIRED') {
      return null;
    }
    if (existing) {
      this.logger.log(
        `🔁 Reserva duplicada ignorada para la orden '${orderId}' (estado '${existing.status}').`,
      );
      return existing;
    }

    const items = await this.prepareValidItems(input, orderId);
    if (!items) {
      return null;
    }

    const itemDocs = await this.loadItemsOrReject(items, orderId);
    if (!itemDocs) {
      return null;
    }

    const ok = await this.ensureStockAvailable(items, itemDocs, orderId);
    if (!ok) {
      return null;
    }

    return this.executeReservation(items, orderId, input);
  }

  private normalizeOrderId(orderId?: string): string | null {
    const trimmed = orderId?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }

  private async getExistingOrExpire(
    orderId: string,
  ): Promise<StockReservation | null | 'EXPIRED'> {
    const existing = await this.reservationModel.findOne({ orderId }).exec();
    if (!existing) {
      return null;
    }

    if (
      existing.status === ReservationStatus.PENDING &&
      existing.expiresAt &&
      existing.expiresAt.getTime() <= Date.now()
    ) {
      const expired = await this.release(
        orderId,
        ReservationStatus.EXPIRED,
        'Reserva expirada por TTL',
      );
      if (expired?.status === ReservationStatus.EXPIRED) {
        return 'EXPIRED';
      }
      return expired ?? null;
    }

    return existing;
  }

  private async prepareValidItems(
    input: ReserveReservationInput,
    orderId: string,
  ): Promise<AggregatedItem[] | null> {
    const {
      valid: items,
      invalid,
      missingRecipes,
      incompleteRecipes,
    } = await this.resolveLinesToItems((input.items as any[]) ?? []);

    // Un platillo sin receta o con receta incompleta se reporta con un error
    // propio, distinto del de stock insuficiente o items inválidos.
    if (missingRecipes.length > 0) {
      await this.publishRejected(
        orderId,
        missingRecipes.map((plateId) => ({
          itemId: plateId,
          requestedQuantity: 0,
        })),
        `Receta no encontrada para: ${missingRecipes.join(', ')}`,
        input.eventId,
        input.correlationId,
        ReservationErrorCodes.RecipeNotFound,
      );
      return null;
    }

    if (incompleteRecipes.length > 0) {
      await this.publishRejected(
        orderId,
        incompleteRecipes.map((plateId) => ({
          itemId: plateId,
          requestedQuantity: 0,
        })),
        `Receta incompleta (insumos inexistentes) para: ${incompleteRecipes.join(', ')}`,
        input.eventId,
        input.correlationId,
        ReservationErrorCodes.RecipeIncomplete,
      );
      return null;
    }

    if (invalid.length > 0) {
      await this.publishRejected(
        orderId,
        invalid.map((item: any) => ({
          itemId: String(item?.itemId ?? item?.plateId ?? ''),
          requestedQuantity: Number(item?.quantity ?? 0),
        })),
        'La orden contiene items inválidos',
        input.eventId,
        input.correlationId,
        ReservationErrorCodes.InvalidItems,
      );
      return null;
    }

    if (items.length === 0) {
      await this.publishRejected(
        orderId,
        [],
        'La orden no contiene items válidos',
      );
      return null;
    }

    return items;
  }

  private async loadItemsOrReject(
    items: AggregatedItem[],
    orderId: string,
  ): Promise<Map<string, Item> | null> {
    const itemDocs = new Map<string, Item>();

    for (const item of items) {
      try {
        const doc = await this.itemService.findOne(item.itemId);
        itemDocs.set(item.itemId, doc);
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }

        await this.publishRejected(
          orderId,
          [
            {
              itemId: item.itemId,
              requestedQuantity: item.quantity,
              availableStock: 0,
            },
          ],
          `Item '${item.itemId}' no encontrado`,
        );
        return null;
      }
    }

    return itemDocs;
  }

  private async ensureStockAvailable(
    items: AggregatedItem[],
    itemDocs: Map<string, Item>,
    orderId: string,
  ): Promise<boolean> {
    const insufficient = items.filter(
      (item) =>
        availableStockOf(itemDocs.get(item.itemId) as Item) < item.quantity,
    );

    if (insufficient.length === 0) {
      return true;
    }

    await this.publishRejected(
      orderId,
      insufficient.map((item) => ({
        itemId: item.itemId,
        itemName: itemDocs.get(item.itemId)?.name,
        requestedQuantity: item.quantity,
        availableStock: availableStockOf(itemDocs.get(item.itemId) as Item),
      })),
      'Stock insuficiente para cubrir la reserva',
      undefined,
      undefined,
      ReservationErrorCodes.InsufficientStock,
    );
    return false;
  }

  private async executeReservation(
    items: AggregatedItem[],
    orderId: string,
    input: ReserveReservationInput,
  ): Promise<StockReservation | null> {
    const reserved: AggregatedItem[] = [];

    try {
      for (const item of items) {
        const updated = await this.itemService.reserveStock(
          item.itemId,
          item.quantity,
        );
        if (!updated) {
          throw new InsufficientStockError(item.itemId, item.quantity);
        }
        reserved.push(item);
      }

      const ttlMinutes = input.ttlMinutes ?? resolveReservationTtlMinutes();
      const reservation = new this.reservationModel({
        orderId,
        items: items.map((item) => ({
          itemId: new Types.ObjectId(item.itemId),
          quantity: item.quantity,
        })),
        status: ReservationStatus.PENDING,
        expiresAt:
          ttlMinutes > 0
            ? new Date(Date.now() + ttlMinutes * 60 * 1000)
            : null,
        eventId: input.eventId ?? null,
        correlationId: input.correlationId ?? null,
      });

      const saved = await reservation.save();
      this.cache.invalidateOrder(orderId);
      this.cache.setOrder(orderId, saved, saved.expiresAt ?? null);
      await this.publishConfirmed(saved);
      return saved;
    } catch (error) {
      await this.rollbackReserved(reserved);

      if (error instanceof InsufficientStockError) {
        await this.publishRejected(
          orderId,
          [
            {
              itemId: error.itemId,
              requestedQuantity: error.quantity,
              availableStock: await this.currentAvailableStock(error.itemId),
            },
          ],
          'Stock insuficiente para cubrir la reserva',
        );
        return null;
      }

      if (this.isDuplicateKeyError(error)) {
        const concurrent = await this.reservationModel
          .findOne({ orderId })
          .exec();
        if (concurrent) {
          return concurrent;
        }
      }

      throw error;
    }
  }

  async confirm(
    orderId: string,
    eventId?: string,
    correlationId?: string,
  ): Promise<StockReservation | null> {
    const reservation = await this.reservationModel
      .findOne({ orderId })
      .exec();
    if (!reservation) {
      await this.publishRejected(
        orderId,
        [],
        'No existe una reserva para la orden',
        eventId,
        correlationId,
      );
      return null;
    }

    if (
      reservation.status === ReservationStatus.PENDING &&
      reservation.expiresAt &&
      reservation.expiresAt.getTime() <= Date.now()
    ) {
      const expired = await this.release(
        orderId,
        ReservationStatus.EXPIRED,
        'Reserva expirada por TTL',
      );
      if (expired?.status !== ReservationStatus.EXPIRED) {
        return expired;
      }

      await this.publishRejected(
        orderId,
        [],
        'La reserva expiró antes de confirmarse',
        eventId,
        correlationId,
      );
      return expired;
    }

    if (reservation.status === ReservationStatus.CONFIRMED) {
      return reservation;
    }

    if (reservation.status !== ReservationStatus.PENDING) {
      await this.publishRejected(
        orderId,
        [],
        `La reserva está en estado '${reservation.status}' y no puede confirmarse`,
        eventId,
        correlationId,
      );
      return reservation;
    }

    const updated = await this.reservationModel
      .findOneAndUpdate(
        { orderId, status: ReservationStatus.PENDING },
        {
          status: ReservationStatus.CONFIRMED,
          expiresAt: null,
          ...(eventId ? { eventId } : {}),
          ...(correlationId ? { correlationId } : {}),
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      return this.reservationModel.findOne({ orderId }).exec();
    }

    this.cache.invalidateOrder(orderId);
    this.cache.setOrder(orderId, updated, null);
    await this.publishConfirmed(updated);
    return updated;
  }

  async release(
    orderId: string,
    status: ReservationStatus.RELEASED | ReservationStatus.EXPIRED =
      ReservationStatus.RELEASED,
    reason?: string,
    context: { eventId?: string; correlationId?: string } = {},
  ): Promise<StockReservation | null> {
    const reservation = await this.reservationModel
      .findOne({ orderId })
      .exec();
    if (!reservation) {
      return null;
    }

    if (
      reservation.status === status ||
      reservation.status === ReservationStatus.RELEASED ||
      reservation.status === ReservationStatus.EXPIRED
    ) {
      return reservation;
    }

    if (reservation.status === ReservationStatus.CONSUMED) {
      // Punto de no retorno: una orden servida ya descontó el stock. La
      // cancelación se rechaza y cualquier reingreso debe registrarse como
      // merma.
      this.logger.warn(
        `⚠️ No se libera la reserva '${orderId}': la orden ya fue servida.`,
      );
      if (status === ReservationStatus.RELEASED) {
        await this.publishRejected(
          orderId,
          [],
          'La orden ya fue servida: no se puede cancelar. Registra el reingreso como merma.',
          context.eventId,
          context.correlationId,
          ReservationErrorCodes.AlreadyServed,
        );
      }
      return reservation;
    }

    const updateFilter =
      status === ReservationStatus.EXPIRED
        ? {
            orderId,
            status: ReservationStatus.PENDING,
            expiresAt: { $ne: null, $lte: new Date() },
          }
        : {
            orderId,
            status: {
              $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
            },
          };

    const updated = await this.reservationModel
      .findOneAndUpdate(
        updateFilter,
        { status, reason: reason ?? null },
        { new: true },
      )
      .exec();

    if (!updated) {
      return this.reservationModel.findOne({ orderId }).exec();
    }

    await this.releaseReservedItems(updated);
    this.cache.invalidateOrder(orderId);
    await this.publishResult(
      status === ReservationStatus.EXPIRED
        ? InventoryRoutingKeys.ReservationExpired
        : InventoryRoutingKeys.ReservationReleased,
      this.buildResult(updated, reason),
    );
    return updated;
  }

  async expireDue(now = new Date()): Promise<number> {
    const due = await this.reservationModel
      .find({
        status: ReservationStatus.PENDING,
        expiresAt: { $ne: null, $lte: now },
      })
      .exec();

    let expired = 0;
    for (const reservation of due) {
      const updated = await this.release(
        reservation.orderId,
        ReservationStatus.EXPIRED,
        'Reserva expirada por TTL',
      );
      if (updated?.status === ReservationStatus.EXPIRED) {
        expired += 1;
      }
    }
    return expired;
  }

  async findAll(query: QueryReservationsDto = {}): Promise<StockReservation[]> {
    const cacheKey = this.buildQueryCacheKey(query);
    const cached = this.cache.getQuery<StockReservation[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
      if (query.status === ReservationStatus.PENDING) {
        filter.$or = [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ];
      }
    }
    if (query.orderId) {
      filter.orderId = query.orderId;
    }
    if (query.itemId) {
      if (!isValidObjectId(query.itemId)) {
        return [];
      }
      filter['items.itemId'] = new Types.ObjectId(query.itemId);
    }

    const request = this.reservationModel
      .find(filter)
      .sort({ createdAt: -1 });
    if (query.limit) {
      request.limit(query.limit);
    }

    const result = await request.exec();
    this.cache.setQuery(cacheKey, result);
    return result;
  }

  async findByOrderId(orderId: string): Promise<StockReservation> {
    const cached = this.cache.getOrder<StockReservation>(orderId);
    if (cached) {
      return cached;
    }

    const reservation = await this.reservationModel
      .findOne({ orderId })
      .exec();
    if (!reservation) {
      throw new NotFoundException(`Reserva para la orden '${orderId}' no encontrada`);
    }

    if (
      reservation.status === ReservationStatus.PENDING &&
      reservation.expiresAt &&
      reservation.expiresAt.getTime() <= Date.now()
    ) {
      const expired = await this.release(
        orderId,
        ReservationStatus.EXPIRED,
        'Reserva expirada por TTL',
      );
      if (expired) {
        return expired;
      }
    }

    this.cache.setOrder(orderId, reservation, reservation.expiresAt ?? null);
    return reservation;
  }

  async getPendingSummary(itemId?: string): Promise<PendingSummaryRow[]> {
    const reservations = await this.findAll({
      status: ReservationStatus.PENDING,
      itemId,
    });

    const summary = new Map<
      string,
      { reservedQuantity: number; reservationsCount: number }
    >();

    for (const reservation of reservations) {
      for (const item of reservation.items) {
        const key = item.itemId.toString();
        const current = summary.get(key) ?? {
          reservedQuantity: 0,
          reservationsCount: 0,
        };
        current.reservedQuantity = roundQuantity(
          current.reservedQuantity + Number(item.quantity),
        );
        current.reservationsCount += 1;
        summary.set(key, current);
      }
    }

    return Array.from(summary.entries())
      .map(([id, values]) => ({ itemId: id, ...values }))
      .sort((a, b) => b.reservedQuantity - a.reservedQuantity);
  }

  private async currentAvailableStock(itemId: string): Promise<number> {
    try {
      return availableStockOf(await this.itemService.findOne(itemId));
    } catch {
      return 0;
    }
  }

  private async resolveLinesToItems(
    lines: Array<{ plateId?: string; itemId?: string; quantity?: number }>,
  ): Promise<AggregatedItems> {
    if (!Array.isArray(lines)) {
      return { valid: [], invalid: [], missingRecipes: [], incompleteRecipes: [] };
    }

    const aggregated = new Map<string, number>();
    const invalid: any[] = [];
    const missingRecipes = new Set<string>();
    const incompleteRecipes = new Set<string>();

    for (const line of lines) {
      const quantity = this.normalizeLineQuantity(line?.quantity);
      if (quantity === null) {
        invalid.push(line);
        continue;
      }

      const plateId = this.getNonEmptyString(line?.plateId);
      if (plateId) {
        const expanded = await this.expandPlateIdToItems(plateId, quantity);
        if (expanded === 'NOT_FOUND') {
          missingRecipes.add(plateId);
          continue;
        }
        if (expanded === 'INCOMPLETE') {
          incompleteRecipes.add(plateId);
          continue;
        }
        if (expanded === 'INVALID') {
          invalid.push(line);
          continue;
        }
        for (const { itemId, totalQty } of expanded) {
          aggregated.set(
            itemId,
            roundQuantity((aggregated.get(itemId) ?? 0) + totalQty),
          );
        }
        continue;
      }

      const itemId = this.getNonEmptyString(line?.itemId);
      if (itemId) {
        if (!isValidObjectId(itemId)) {
          invalid.push(line);
          continue;
        }
        aggregated.set(
          itemId,
          roundQuantity((aggregated.get(itemId) ?? 0) + quantity),
        );
        continue;
      }

      invalid.push(line);
    }

    return {
      valid: Array.from(aggregated.entries()).map(([itemId, quantity]) => ({
        itemId,
        quantity,
      })),
      invalid,
      missingRecipes: Array.from(missingRecipes),
      incompleteRecipes: Array.from(incompleteRecipes),
    };
  }

  private normalizeLineQuantity(value: unknown): number | null {
    const quantity = Number(value ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }
    return quantity;
  }

  private getNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private async expandPlateIdToItems(
    plateId: string,
    quantity: number,
  ): Promise<PlateExpansion> {
    try {
      const recipe = await this.recipeModel
        .findOne({ plateId })
        .exec();

      if (!recipe) {
        return 'NOT_FOUND';
      }
      if (recipe.isComplete === false) {
        return 'INCOMPLETE';
      }
      if (!recipe.items || recipe.items.length === 0) {
        return 'INVALID';
      }

      const expanded: Array<{ itemId: string; totalQty: number }> = [];
      for (const recipeItem of recipe.items) {
        const itemId = recipeItem.itemId?.toString();
        if (!itemId || !isValidObjectId(itemId)) {
          return 'INVALID';
        }
        const required = Number(recipeItem.requiredQuantity ?? 0);
        if (!Number.isFinite(required) || required <= 0) {
          return 'INVALID';
        }
        const totalQty = roundQuantity(required * quantity);
        expanded.push({ itemId, totalQty });
      }
      return expanded;
    } catch (error) {
      this.logger.error(
        `Error al expandir plateId '${plateId}' a items:`,
        error,
      );
      return 'INVALID';
    }
  }

  private async rollbackReserved(items: AggregatedItem[]): Promise<void> {
    for (const item of [...items].reverse()) {
      try {
        await this.itemService.adjustReservedStock(item.itemId, -item.quantity);
      } catch (error) {
        this.logger.error(
          `❌ No se pudo revertir la reserva del item '${item.itemId}':`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async releaseReservedItems(
    reservation: StockReservation,
  ): Promise<void> {
    for (const item of reservation.items) {
      try {
        await this.itemService.adjustReservedStock(
          item.itemId.toString(),
          -Number(item.quantity),
        );
      } catch (error) {
        this.logger.error(
          `❌ No se pudo liberar el stock reservado del item '${item.itemId}':`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private buildQueryCacheKey(query: QueryReservationsDto): string {
    return JSON.stringify({
      status: query.status ?? null,
      orderId: query.orderId ?? null,
      itemId: query.itemId ?? null,
      limit: query.limit ?? null,
    });
  }

  private buildResult(
    reservation: StockReservation,
    reason?: string,
  ): ReservationResultEvent {
    return {
      orderId: reservation.orderId,
      status: reservation.status,
      eventId: reservation.eventId ?? undefined,
      correlationId: reservation.correlationId ?? undefined,
      reason: reason ?? reservation.reason ?? undefined,
      items: reservation.items.map((item) => ({
        itemId: item.itemId.toString(),
        requestedQuantity: Number(item.quantity),
      })),
      timestamp: new Date().toISOString(),
    };
  }

  private async publishConfirmed(
    reservation: StockReservation,
  ): Promise<void> {
    await this.publishResult(
      InventoryRoutingKeys.ReservationConfirmed,
      this.buildResult(reservation),
    );
  }

  private async publishRejected(
    orderId: string,
    items: ReservationResultItem[],
    reason: string,
    eventId?: string,
    correlationId?: string,
    errorCode?: string,
  ): Promise<void> {
    await this.publishResult(InventoryRoutingKeys.ReservationRejected, {
      orderId,
      status: 'rejected',
      eventId,
      correlationId,
      reason,
      ...(errorCode ? { errorCode } : {}),
      items,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Descuento definitivo al servir una orden (punto de no retorno).
   *
   * Solo se consume una reserva activa (pendiente vigente o confirmada) y
   * siempre con las cantidades que se reservaron, no con las del evento:
   * - sin reserva, o con la reserva liberada o expirada, se rechaza sin
   *   tocar el stock;
   * - una orden ya consumida no se vuelve a consumir, aunque llegue otro
   *   evento con distinto eventId.
   * La transición a `consumed` es atómica, así que dos eventos simultáneos
   * no pueden descontar dos veces.
   */
  async consumeServedOrder(input: {
    orderId: string;
    eventId: string;
    correlationId?: string;
    items?: Array<{ plateId?: string; itemId?: string; quantity?: number }>;
    reason?: string;
  }): Promise<StockReservation | null> {
    const orderId = input.orderId?.trim();
    if (!orderId) {
      return null;
    }

    let reservation: StockReservation | null = await this.reservationModel
      .findOne({ orderId })
      .exec();
    if (!reservation) {
      await this.publishRejected(
        orderId,
        [],
        'No existe una reserva para la orden servida: no se descuenta stock',
        input.eventId,
        input.correlationId,
        ReservationErrorCodes.ReservationNotFound,
      );
      return null;
    }

    if (reservation.status === ReservationStatus.CONSUMED) {
      this.logger.log(
        `🔁 La orden '${orderId}' ya fue servida y consumida; se ignora.`,
      );
      return reservation;
    }

    // Una reserva pendiente vencida se expira (devuelve su stock) y ya no
    // puede consumirse.
    if (
      reservation.status === ReservationStatus.PENDING &&
      reservation.expiresAt &&
      reservation.expiresAt.getTime() <= Date.now()
    ) {
      reservation =
        (await this.release(
          orderId,
          ReservationStatus.EXPIRED,
          'Reserva expirada por TTL',
        )) ?? reservation;
    }

    const claimed = await this.reservationModel
      .findOneAndUpdate(
        {
          orderId,
          status: {
            $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
        },
        {
          status: ReservationStatus.CONSUMED,
          expiresAt: null,
          reason: input.reason ?? reservation.reason ?? null,
        },
        { new: true },
      )
      .exec();

    if (!claimed) {
      const current = await this.reservationModel.findOne({ orderId }).exec();
      if (current?.status === ReservationStatus.CONSUMED) {
        return current;
      }
      await this.publishRejected(
        orderId,
        [],
        `La reserva está en estado '${current?.status ?? reservation.status}' y no puede consumirse`,
        input.eventId,
        input.correlationId,
        ReservationErrorCodes.ReservationNotActive,
      );
      return current ?? reservation;
    }

    const itemsToConsume: AggregatedItem[] = claimed.items.map((item) => ({
      itemId: item.itemId.toString(),
      quantity: Number(item.quantity),
    }));

    await this.releaseReservedItems(claimed);
    await this.consumeItemsByFefo(itemsToConsume, orderId);

    this.cache.invalidateOrder(orderId);
    this.cache.setOrder(orderId, claimed, null);

    await this.publishConsumedEvent(orderId, itemsToConsume, input);
    return claimed;
  }

  private async consumeItemsByFefo(
    itemsToConsume: AggregatedItem[],
    orderId: string,
  ): Promise<void> {
    for (const item of itemsToConsume) {
      try {
        await this.batchService.consumeByFefo(
          item.itemId,
          item.quantity,
          orderId,
          'Consumo por orden servida',
        );
      } catch (error) {
        this.logger.error(
          `Error al consumir por FEFO el item '${item.itemId}' para orden '${orderId}':`,
          error,
        );
      }
    }
  }

  private async publishConsumedEvent(
    orderId: string,
    itemsToConsume: AggregatedItem[],
    input: {
      eventId: string;
      correlationId?: string;
      reason?: string;
    },
  ): Promise<void> {
    try {
      await this.publishResult(InventoryRoutingKeys.ReservationConsumed, {
        orderId,
        status: ReservationStatus.CONSUMED,
        eventId: input.eventId,
        correlationId: input.correlationId,
        reason: input.reason,
        items: itemsToConsume.map((item) => ({
          itemId: item.itemId,
          requestedQuantity: item.quantity,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo publicar '${InventoryRoutingKeys.ReservationConsumed}' para la orden '${orderId}': ${error}`,
      );
    }
  }

  private async publishResult(
    routingKey: string,
    event: ReservationResultEvent,
  ): Promise<void> {
    try {
      await this.publisher.publish(INVENTORY_EXCHANGE, routingKey, event);
    } catch (error) {
      this.logger.warn(
        `No se pudo publicar '${routingKey}' para la orden '${event.orderId}': ${error}`,
      );
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code: number }).code === DUPLICATE_KEY_ERROR_CODE
    );
  }
}

class InsufficientStockError extends Error {
  constructor(
    readonly itemId: string,
    readonly quantity: number,
  ) {
    super(`Stock insuficiente para el item '${itemId}'`);
  }
}
