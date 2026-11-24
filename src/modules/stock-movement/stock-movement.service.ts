import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { QueryStockMovementsDto } from './dto/query-stock-movements.dto.js';
import {
  StockMovement,
  StockMovementType,
} from './schemas/stock-movement.schema.js';
import {
  buildPaginatedResult,
  normalizePagination,
  PaginatedResult,
} from '../../common/pagination/index.js';

export interface RecordStockMovementInput {
  batchId: string | Types.ObjectId;
  movementType: StockMovementType;
  quantity: number;
  referenceId?: string | null;
  reason?: string | null;
  createdBy?: string;
}

const MAX_QUANTITY = 999999999.999;
const DEFAULT_CREATED_BY = 'system';

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

@Injectable()
export class StockMovementService {
  constructor(
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovement>,
  ) {}

  async record(input: RecordStockMovementInput): Promise<StockMovement> {
    const batchId = String(input.batchId ?? '');
    if (!isValidObjectId(batchId)) {
      throw new BadRequestException(`Lote con id '${batchId}' inválido`);
    }

    const quantity = roundQuantity(Number(input.quantity));
    if (!Number.isFinite(quantity) || Math.abs(quantity) > MAX_QUANTITY) {
      throw new BadRequestException('La cantidad del movimiento es inválida');
    }

    if (input.movementType === StockMovementType.ADJUSTMENT) {
      if (quantity === 0) {
        throw new BadRequestException(
          'Un ajuste de stock no puede tener cantidad 0',
        );
      }
    } else if (quantity <= 0) {
      throw new BadRequestException(
        'La cantidad del movimiento debe ser mayor a 0',
      );
    }

    const createdBy =
      (input.createdBy ?? DEFAULT_CREATED_BY).trim().slice(0, 50) ||
      DEFAULT_CREATED_BY;

    const movement = new this.stockMovementModel({
      batchId: new Types.ObjectId(batchId),
      movementType: input.movementType,
      quantity,
      referenceId: input.referenceId?.trim() || null,
      reason: input.reason?.trim() || null,
      createdBy,
    });

    return movement.save();
  }

  async recordMany(
    inputs: RecordStockMovementInput[],
  ): Promise<StockMovement[]> {
    const movements: StockMovement[] = [];
    for (const input of inputs) {
      movements.push(await this.record(input));
    }
    return movements;
  }

  private buildFilter(
    query: QueryStockMovementsDto = {},
  ): FilterQuery<StockMovement> | null {
    const filter: FilterQuery<StockMovement> = {};

    if (query.batchId) {
      if (!isValidObjectId(query.batchId)) {
        return null;
      }
      filter.batchId = new Types.ObjectId(query.batchId);
    }
    if (query.movementType) {
      filter.movementType = query.movementType;
    }
    if (query.referenceId) {
      filter.referenceId = query.referenceId;
    }

    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (query.from) {
      createdAt.$gte = new Date(query.from);
    }
    if (query.to) {
      createdAt.$lte = new Date(query.to);
    }
    if (Object.keys(createdAt).length > 0) {
      filter.createdAt = createdAt;
    }

    return filter;
  }

  async findAll(
    query: QueryStockMovementsDto = {},
  ): Promise<PaginatedResult<StockMovement>> {
    const { page, limit } = normalizePagination(query.page, query.limit);
    const filter = this.buildFilter(query);
    if (filter === null) {
      return buildPaginatedResult([], 0, page, limit);
    }

    const [total, items] = await Promise.all([
      this.stockMovementModel.countDocuments(filter).exec(),
      this.stockMovementModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
    ]);

    return buildPaginatedResult(items, total, page, limit);
  }

  async findAllUnpaginated(
    query: QueryStockMovementsDto = {},
  ): Promise<StockMovement[]> {
    const filter = this.buildFilter(query);
    if (filter === null) {
      return [];
    }

    return this.stockMovementModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .exec();
  }
}
