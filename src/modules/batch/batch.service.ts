import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Batch, BatchStatus } from './schemas/batch.schema.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { IngredientService } from '../ingredient/ingredient.service.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class BatchService implements OnModuleInit {
  constructor(
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
    private readonly ingredientService: IngredientService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.batchModel.collection?.dropIndex('batchNumber_1');
    } catch {
      // El índice global legado ya no existe; no se requiere acción.
    }
  }

  async create(createDto: CreateBatchDto): Promise<Batch> {
    const ingredient = await this.ingredientService.findOne(
      createDto.ingredientId,
    );

    const batchNumber = this.buildBatchNumber(
      createDto.batchNumber,
      ingredient?.sku,
    );
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
      await this.syncIngredientStockAndCost(createDto.ingredientId);
      return saved;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Ya existe un lote con el número '${batchNumber}' para este ingrediente`,
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

  async findAll(ingredientId?: string): Promise<Batch[]> {
    if (ingredientId) {
      if (!isValidObjectId(ingredientId)) {
        return [];
      }
      return this.batchModel.find({ ingredientId }).exec();
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

    const nextQuantity = updateDto.quantity ?? currentBatch.quantity;
    const nextExpirationDate =
      updateDto.expirationDate ?? currentBatch.expirationDate;
    const status = this.computeStatus(nextQuantity, nextExpirationDate);

    const updatedBatch = await this.batchModel
      .findByIdAndUpdate(id, { ...updateDto, status }, { new: true })
      .exec();

    if (!updatedBatch) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    await this.syncIngredientStockAndCost(String(currentBatch.ingredientId));

    return updatedBatch;
  }

  async remove(id: string): Promise<void> {
    const currentBatch = await this.findOne(id);

    const result = await this.batchModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    await this.syncIngredientStockAndCost(String(currentBatch.ingredientId));
  }

  private async syncIngredientStockAndCost(ingredientId: string): Promise<void> {
    if (!isValidObjectId(ingredientId)) {
      return;
    }

    const batches = await this.batchModel.find({ ingredientId }).exec();
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

    await this.ingredientService.updateStockAndCost(
      ingredientId,
      Math.round(totalStock * 1000) / 1000,
      averageCost,
    );
  }
}
