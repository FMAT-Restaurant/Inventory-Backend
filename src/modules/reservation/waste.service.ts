import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StockMovementService } from '../stock-movement/stock-movement.service.js';
import {
  StockMovement,
  StockMovementType,
} from '../stock-movement/schemas/stock-movement.schema.js';
import {
  ReservationStatus,
  StockReservation,
} from './schemas/stock-reservation.schema.js';
import { CreateWasteDto } from './dto/create-waste.dto.js';

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Registro de mermas: pérdidas de insumos que ya se descontaron al servir
 * una orden. Solo deja constancia en el historial de movimientos; no
 * modifica el stock, porque el consumo ya se aplicó.
 */
@Injectable()
export class WasteService {
  constructor(
    @InjectModel(StockReservation.name)
    private readonly reservationModel: Model<StockReservation>,
    private readonly stockMovementService: StockMovementService,
  ) {}

  async register(
    dto: CreateWasteDto,
    createdBy: string,
  ): Promise<StockMovement> {
    const reservation = await this.reservationModel
      .findOne({ orderId: dto.orderId })
      .exec();
    if (reservation?.status !== ReservationStatus.CONSUMED) {
      throw new UnprocessableEntityException(
        `Solo se puede registrar merma de órdenes servidas; la orden '${dto.orderId}' no lo está`,
      );
    }

    const consumed = await this.sumQuantity(
      dto.orderId,
      dto.batchId,
      StockMovementType.OUT,
    );
    if (consumed <= 0) {
      throw new UnprocessableEntityException(
        `El lote '${dto.batchId}' no fue consumido por la orden '${dto.orderId}'`,
      );
    }

    const alreadyWasted = await this.sumQuantity(
      dto.orderId,
      dto.batchId,
      StockMovementType.WASTE,
    );
    const remaining = roundQuantity(consumed - alreadyWasted);
    if (dto.quantity > remaining) {
      throw new UnprocessableEntityException(
        `La merma excede lo consumido por la orden en ese lote (disponible para merma: ${remaining})`,
      );
    }

    return this.stockMovementService.record({
      batchId: dto.batchId,
      movementType: StockMovementType.WASTE,
      quantity: dto.quantity,
      referenceId: dto.orderId,
      reason: dto.reason,
      createdBy,
    });
  }

  private async sumQuantity(
    orderId: string,
    batchId: string,
    movementType: StockMovementType,
  ): Promise<number> {
    const movements = await this.stockMovementService.findAll({
      referenceId: orderId,
      batchId,
      movementType,
    });
    return roundQuantity(
      movements.reduce((sum, movement) => sum + Number(movement.quantity), 0),
    );
  }
}
