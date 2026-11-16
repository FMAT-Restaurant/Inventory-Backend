import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  DishRejectedEvent,
  OrderWastedEvent,
  WastedLine,
} from '../../broker/event-conventions.js';
import { BatchService } from '../batch/batch.service.js';
import { Recipe } from '../recipe/schemas/recipe.schema.js';
import {
  StockMovement,
  StockMovementType,
} from '../stock-movement/schemas/stock-movement.schema.js';
import { StockMovementService } from '../stock-movement/stock-movement.service.js';
import { CreateWasteDto } from './dto/create-waste.dto.js';
import { ReservationService } from './reservation.service.js';
import {
  ReservationStatus,
  StockReservation,
} from './schemas/stock-reservation.schema.js';

const ORDERS_ACTOR = 'ordenes';

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface OrderWasteResult {
  /** Movimientos `waste` registrados. */
  recorded: number;
  /** Platillos que no se pudieron relacionar con una receta o con consumo. */
  skipped: number;
}

/**
 * Mermas de inventario.
 *
 * - Manual: lote, cantidad y motivo. Descuenta del lote.
 * - Por evento de Órdenes (`ordenes.order.wasted`): el stock ya se descontó
 *   al iniciar la preparación, así que solo se deja constancia en el
 *   historial de movimientos, sin volver a descontar.
 */
@Injectable()
export class WasteService {
  private readonly logger = new Logger(WasteService.name);
  // Mermas de una misma orden en cola: se procesan una a una para que dos
  // eventos simultáneos no sumen más de lo que la orden consumió.
  private readonly orderLocks = new Map<string, Promise<unknown>>();

  constructor(
    @InjectModel(StockReservation.name)
    private readonly reservationModel: Model<StockReservation>,
    @InjectModel(Recipe.name)
    private readonly recipeModel: Model<Recipe>,
    private readonly stockMovementService: StockMovementService,
    private readonly batchService: BatchService,
    private readonly reservationService: ReservationService,
  ) {}

  /** Merma manual de un lote: no depende de ninguna orden. */
  async registerManual(
    dto: CreateWasteDto,
    createdBy: string,
  ): Promise<StockMovement> {
    const { movement } = await this.batchService.registerWaste(
      dto.batchId,
      dto.quantity,
      dto.reason,
      createdBy,
    );
    return movement;
  }

  /**
   * Merma reportada por Órdenes para una comanda ya en preparación o servida.
   * Cada platillo afectado se convierte en insumos con su receta y se asigna
   * a los lotes que la orden consumió, sin pasar de lo consumido.
   */
  async registerOrderWaste(event: OrderWastedEvent): Promise<OrderWasteResult> {
    const previous = this.orderLocks.get(event.orderId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.recordOrderWaste(event));
    this.orderLocks.set(event.orderId, current);
    try {
      return await current;
    } finally {
      if (this.orderLocks.get(event.orderId) === current) {
        this.orderLocks.delete(event.orderId);
      }
    }
  }

  private async recordOrderWaste(
    event: OrderWastedEvent,
  ): Promise<OrderWasteResult> {
    const result: OrderWasteResult = { recorded: 0, skipped: 0 };

    const reservation = await this.reservationModel
      .findOne({ orderId: event.orderId })
      .exec();
    if (reservation?.status !== ReservationStatus.CONSUMED) {
      this.logger.warn(
        `⚠️ Merma de la orden '${event.orderId}' ignorada: la orden no tiene consumo registrado.`,
      );
      result.skipped = event.lines.length;
      return result;
    }

    const available = await this.consumedBatchesByItem(event.orderId);

    for (const line of event.lines) {
      const plateId =
        line.plateId ??
        reservation.lines?.find((l) => l.offerId === line.offerId)?.plateId;
      const needs = plateId
        ? await this.expandRecipe(plateId, line.quantity)
        : null;
      if (!needs) {
        this.logger.warn(
          `⚠️ Merma de la orden '${event.orderId}': no se encontró la receta del platillo '${line.plateId ?? line.offerId}'.`,
        );
        result.skipped += 1;
        continue;
      }

      let lineRecorded = false;
      for (const need of needs) {
        let remaining = need.quantity;
        for (const batch of available.get(need.itemId) ?? []) {
          if (remaining <= 0) break;
          const take = roundQuantity(Math.min(remaining, batch.available));
          if (take <= 0) continue;

          await this.stockMovementService.record({
            batchId: batch.batchId,
            movementType: StockMovementType.WASTE,
            quantity: take,
            referenceId: event.orderId,
            reason: event.reason,
            createdBy: ORDERS_ACTOR,
          });
          batch.available = roundQuantity(batch.available - take);
          remaining = roundQuantity(remaining - take);
          result.recorded += 1;
          lineRecorded = true;
        }
        if (remaining > 0) {
          this.logger.warn(
            `⚠️ La merma del insumo '${need.itemId}' de la orden '${event.orderId}' excede lo consumido en ${remaining}; se registra solo lo consumido.`,
          );
        }
      }
      if (!lineRecorded) {
        result.skipped += 1;
      }
    }

    return result;
  }

  /**
   * Cocina rechazó un platillo. Con la orden aún reservada se libera solo el
   * stock reservado de ese platillo (nada se gastó, no hay merma). Si ya se
   * consumió, el insumo sí se perdió y se registra como merma.
   */
  async handleDishRejected(event: DishRejectedEvent): Promise<void> {
    const reservation = await this.reservationModel
      .findOne({ orderId: event.orderId })
      .exec();

    if (reservation?.status === ReservationStatus.CONSUMED) {
      const line: WastedLine = {
        plateId: event.plateId,
        offerId: event.offerId,
        quantity: event.quantity,
      };
      await this.registerOrderWaste({
        eventId: event.eventId,
        orderId: event.orderId,
        correlationId: event.correlationId,
        reason: event.reason,
        lines: [line],
      });
      return;
    }

    const outcome = await this.reservationService.releaseDish({
      orderId: event.orderId,
      plateId: event.plateId,
      offerId: event.offerId,
      quantity: event.quantity,
      reason: event.reason,
    });
    if (outcome !== 'released') {
      this.logger.warn(
        `⚠️ Platillo rechazado de la orden '${event.orderId}' sin cambios en la reserva (${outcome}).`,
      );
    }
  }

  private async expandRecipe(
    plateId: string,
    quantity: number,
  ): Promise<Array<{ itemId: string; quantity: number }> | null> {
    const recipe = await this.recipeModel.findOne({ plateId }).exec();
    if (!recipe || !recipe.items?.length) {
      return null;
    }
    return recipe.items.map((recipeItem) => ({
      itemId: String(recipeItem.itemId),
      quantity: roundQuantity(Number(recipeItem.requiredQuantity) * quantity),
    }));
  }

  /**
   * Lotes que consumió la orden por insumo, del primero al último, con lo que
   * todavía se puede registrar como merma (consumido menos mermado).
   */
  private async consumedBatchesByItem(
    orderId: string,
  ): Promise<Map<string, Array<{ batchId: string; available: number }>>> {
    const outs = (
      await this.stockMovementService.findAll({
        referenceId: orderId,
        movementType: StockMovementType.OUT,
      })
    ).reverse();
    const wastes = await this.stockMovementService.findAll({
      referenceId: orderId,
      movementType: StockMovementType.WASTE,
    });

    const wastedByBatch = new Map<string, number>();
    for (const movement of wastes) {
      const key = String(movement.batchId);
      wastedByBatch.set(
        key,
        roundQuantity((wastedByBatch.get(key) ?? 0) + Number(movement.quantity)),
      );
    }

    const consumedByBatch = new Map<string, number>();
    for (const movement of outs) {
      const key = String(movement.batchId);
      consumedByBatch.set(
        key,
        roundQuantity((consumedByBatch.get(key) ?? 0) + Number(movement.quantity)),
      );
    }

    const byItem = new Map<
      string,
      Array<{ batchId: string; available: number }>
    >();
    for (const [batchId, consumed] of consumedByBatch) {
      if (!isValidObjectId(batchId)) continue;
      const available = roundQuantity(
        consumed - (wastedByBatch.get(batchId) ?? 0),
      );
      if (available <= 0) continue;
      try {
        const batch = await this.batchService.findOne(batchId);
        const itemId = String(batch.itemId);
        const list = byItem.get(itemId) ?? [];
        list.push({ batchId, available });
        byItem.set(itemId, list);
      } catch {
        // lote eliminado: ya no se puede imputar la merma
      }
    }
    return byItem;
  }
}
