import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Batch, BatchStatus } from './schemas/batch.schema.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { ItemService } from '../item/item.service.js';
import {
  RecordStockMovementInput,
  StockMovementService,
} from '../stock-movement/stock-movement.service.js';
import { StockMovementType } from '../stock-movement/schemas/stock-movement.schema.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class BatchService implements OnModuleInit {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
    private readonly itemService: ItemService,
    private readonly stockMovementService: StockMovementService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.batchModel.collection?.dropIndex('batchNumber_1');
    } catch {
      // El índice global legado ya no existe; no se requiere acción.
    }
  }

  async create(createDto: CreateBatchDto): Promise<Batch> {
    const item = await this.itemService.findOne(createDto.itemId);

    const batchNumber = this.buildBatchNumber(createDto.batchNumber, item?.sku);
    const status = this.computeStatus(
      createDto.quantity,
      createDto.expirationDate,
    );

    const newBatch = new this.batchModel({
      ...createDto,
      batchNumber,
      initialQuantity: createDto.quantity,
      status,
    });

    try {
      const saved = await newBatch.save();
      if (Number(saved.quantity) > 0) {
        await this.recordMovementSafely({
          batchId: String(saved._id),
          movementType: StockMovementType.IN,
          quantity: Number(saved.quantity),
          referenceId: createDto.supplierId ?? null,
          reason: 'Alta de lote',
        });
      }
      await this.syncItemStockAndCost(createDto.itemId);
      return saved;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Ya existe un lote con el número '${batchNumber}' para este item`,
        );
      }
      throw error;
    }
  }

  private buildBatchNumber(rawBatchNumber?: string, sku?: string): string {
    const normalizedSku = sku?.trim().toUpperCase();
    const trimmedBatch = rawBatchNumber?.trim().toUpperCase();

    if (!trimmedBatch) {
      return this.generateBatchNumber(normalizedSku);
    }

    if (normalizedSku && !trimmedBatch.startsWith(`${normalizedSku}-`)) {
      return `${normalizedSku}-${trimmedBatch}`;
    }

    return trimmedBatch;
  }

  private generateBatchNumber(sku?: string): string {
    const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    const baseCode = `LOT-${datePart}-${suffix}`;
    return sku ? `${sku}-${baseCode}` : baseCode;
  }

  private computeStatus(
    quantity: number,
    expirationDate: Date | string,
  ): BatchStatus {
    if (quantity <= 0) {
      return BatchStatus.DEPLETED;
    }

    const expDate = new Date(expirationDate);
    const expDay = Date.UTC(
      expDate.getUTCFullYear(),
      expDate.getUTCMonth(),
      expDate.getUTCDate(),
    );

    const now = new Date();
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );

    if (expDay < today) {
      return BatchStatus.EXPIRED;
    }
    if (expDay === today) {
      return BatchStatus.EXPIRES_TODAY;
    }
    return BatchStatus.ACTIVE;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code: number }).code === DUPLICATE_KEY_ERROR_CODE
    );
  }

  async findAll(itemId?: string): Promise<Batch[]> {
    if (itemId) {
      if (!isValidObjectId(itemId)) {
        return [];
      }
      return this.batchModel.find({ itemId }).exec();
    }
    return this.batchModel.find().exec();
  }

  async findOne(id: string): Promise<Batch> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    const batch = await this.batchModel.findById(id).exec();
    if (!batch) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    return batch;
  }

  async update(id: string, updateDto: UpdateBatchDto): Promise<Batch> {
    const currentBatch = await this.findOne(id);
    const { reason, createdBy, ...batchChanges } = updateDto;

    const nextQuantity = batchChanges.quantity ?? currentBatch.quantity;
    const nextExpirationDate =
      batchChanges.expirationDate ?? currentBatch.expirationDate;
    const status = this.computeStatus(nextQuantity, nextExpirationDate);

    const updatedBatch = await this.batchModel
      .findByIdAndUpdate(id, { ...batchChanges, status }, { new: true })
      .exec();

    if (!updatedBatch) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    const quantityDelta = Number(nextQuantity) - Number(currentBatch.quantity);
    if (quantityDelta !== 0) {
      await this.recordMovementSafely({
        batchId: id,
        movementType: StockMovementType.ADJUSTMENT,
        quantity: quantityDelta,
        reason: reason ?? 'Ajuste manual de lote',
        createdBy,
      });
    }

    await this.syncItemStockAndCost(String(currentBatch.itemId));

    return updatedBatch;
  }

  async remove(id: string): Promise<void> {
    const currentBatch = await this.findOne(id);
    const removedQuantity = Number(currentBatch.quantity);

    const result = await this.batchModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    if (removedQuantity > 0) {
      await this.recordMovementSafely({
        batchId: id,
        movementType: StockMovementType.ADJUSTMENT,
        quantity: -removedQuantity,
        reason: 'Eliminación de lote',
      });
    }

    await this.syncItemStockAndCost(String(currentBatch.itemId));
  }

  private async recordMovementSafely(
    input: RecordStockMovementInput,
  ): Promise<void> {
    try {
      await this.stockMovementService.record(input);
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el movimiento de stock del lote '${input.batchId}'`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async syncItemStockAndCost(itemId: string): Promise<void> {
    if (!isValidObjectId(itemId)) {
      return;
    }

    const batches = await this.batchModel.find({ itemId }).exec();
    const validBatches = batches.filter((b) => {
      const status = this.computeStatus(b.quantity, b.expirationDate);
      return (
        (status === BatchStatus.ACTIVE ||
          status === BatchStatus.EXPIRES_TODAY) &&
        b.quantity > 0
      );
    });

    const totalStock = validBatches.reduce((sum, b) => sum + b.quantity, 0);
    const totalValue = validBatches.reduce(
      (sum, b) => sum + b.quantity * b.cost,
      0,
    );
    const averageCost =
      totalStock > 0
        ? Math.round((totalValue / totalStock) * 100) / 100
        : undefined;

    await this.itemService.updateStockAndCost(
      itemId,
      Math.round(totalStock * 1000) / 1000,
      averageCost,
    );
  }
}
