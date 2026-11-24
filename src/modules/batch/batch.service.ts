import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Batch, BatchStatus } from './schemas/batch.schema.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { ItemService } from '../item/item.service.js';
import { SupplierService } from '../suppliers/supplier.service.js';
import {
  RecordStockMovementInput,
  StockMovementService,
} from '../stock-movement/stock-movement.service.js';
import {
  StockMovement,
  StockMovementType,
} from '../stock-movement/schemas/stock-movement.schema.js';
import {
  buildPaginatedResult,
  normalizePagination,
  PaginatedResult,
} from '../../common/pagination/index.js';
import { QueryBatchesDto } from './dto/query-batches.dto.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

export interface SupplierCostEntry {
  batchId: string;
  batchNumber: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  cost: number;
  purchasedAt: Date;
}

export interface SupplierCostHistoryQuery {
  itemId?: string;
  from?: string;
  to?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface SupplierCostHistoryPage {
  items: SupplierCostEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    items: Array<{ itemId: string; itemName: string; unit: string }>;
  };
}

// Lote propuesto por una asignación FEFO sin consumo (vista previa de reserva)
export interface FefoBatchAllocation {
  batchId: string;
  batchNumber: string;
  expirationDate: string;
  quantity: number;
}

const COST_HISTORY_MAX_LIMIT = 100;

@Injectable()
export class BatchService implements OnModuleInit {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
    private readonly itemService: ItemService,
    private readonly stockMovementService: StockMovementService,
    private readonly supplierService: SupplierService,
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
    // Un lote nuevo solo puede asignarse a un proveedor activo
    if (createDto.supplierId) {
      await this.supplierService.assertAssignable(createDto.supplierId);
    }

    const expirationDate = createDto.expirationDate || null;
    if (item?.isPerishable && !expirationDate) {
      throw new BadRequestException(
        'La fecha de caducidad es obligatoria para insumos perecederos',
      );
    }

    const batchNumber = this.buildBatchNumber(createDto.batchNumber, item?.sku);
    const status = this.computeStatus(createDto.quantity, expirationDate);

    const newBatch = new this.batchModel({
      ...createDto,
      expirationDate,
      batchNumber,
      initialQuantity: createDto.quantity,
      purchaseCost: createDto.cost,
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    const baseCode = `LOT-${datePart}-${suffix}`;
    return sku ? `${sku}-${baseCode}` : baseCode;
  }

  private computeStatus(
    quantity: number,
    expirationDate?: Date | string | null,
    now = new Date(),
  ): BatchStatus {
    if (quantity <= 0) {
      return BatchStatus.DEPLETED;
    }
    if (!expirationDate) {
      return BatchStatus.ACTIVE;
    }

    const expDate = new Date(expirationDate);
    const expDay = Date.UTC(
      expDate.getUTCFullYear(),
      expDate.getUTCMonth(),
      expDate.getUTCDate(),
    );

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

  /**
   * Historial de costos de compra de un proveedor, paginado. Por defecto
   * muestra primero la compra más reciente. Incluye proveedores dados de
   * baja. `filters.items` lista los insumos que el proveedor ha surtido
   * (sin aplicar el resto de filtros) para poblar un selector.
   */
  async getSupplierCostHistory(
    supplierId: string,
    query: SupplierCostHistoryQuery = {},
  ): Promise<SupplierCostHistoryPage> {
    await this.supplierService.findOne(supplierId);

    const limit = Math.min(
      Math.max(Math.trunc(query.limit ?? 20), 1),
      COST_HISTORY_MAX_LIMIT,
    );
    const order = query.order === 'asc' ? 1 : -1;

    // El esquema de lotes declara estas referencias con el tipo de BSON, así
    // que se guardan como texto; se buscan ambos formatos por compatibilidad.
    const baseFilter = {
      supplierId: { $in: [supplierId, new Types.ObjectId(supplierId)] },
    };
    const filter: Record<string, unknown> = { ...baseFilter };
    if (query.itemId) {
      filter.itemId = { $in: [query.itemId, new Types.ObjectId(query.itemId)] };
    }

    const range = this.buildDateRange(query.from, query.to);
    if (range) {
      filter.createdAt = range;
    }

    const total = await this.batchModel.countDocuments(filter).exec();
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(Math.trunc(query.page ?? 1), 1), totalPages);

    const [batches, itemIds] = await Promise.all([
      this.batchModel
        .find(filter)
        .sort({ createdAt: order, _id: order })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.batchModel.distinct('itemId', baseFilter).exec(),
    ]);

    const supplied = Array.from(new Set(itemIds.map((id) => String(id))));
    const items = await this.itemService.findManyIncludingInactive([
      ...supplied,
      ...batches.map((batch) => String(batch.itemId)),
    ]);

    return {
      items: batches.map((batch) => {
        const item = items.get(String(batch.itemId));
        return {
          batchId: String(batch._id),
          batchNumber: batch.batchNumber,
          itemId: String(batch.itemId),
          itemName: item?.name ?? 'Insumo no disponible',
          unit: item?.unit ?? '',
          quantity: Number(batch.initialQuantity),
          cost: Number(batch.purchaseCost ?? batch.cost),
          purchasedAt: (batch as unknown as { createdAt: Date }).createdAt,
        };
      }),
      total,
      page,
      limit,
      totalPages,
      filters: {
        items: supplied
          .map((id) => ({
            itemId: id,
            itemName: items.get(id)?.name ?? 'Insumo no disponible',
            unit: items.get(id)?.unit ?? '',
          }))
          .sort((a, b) => a.itemName.localeCompare(b.itemName, 'es')),
      },
    };
  }

  /**
   * Rango de fechas de compra. Una fecha sin hora ("2026-11-30") incluye
   * todo ese día (UTC); con hora se respeta tal cual.
   */
  private buildDateRange(
    from?: string,
    to?: string,
  ): { $gte?: Date; $lt?: Date; $lte?: Date } | null {
    const range: { $gte?: Date; $lt?: Date; $lte?: Date } = {};

    if (from) {
      range.$gte = new Date(from);
    }
    if (to) {
      const end = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        end.setUTCDate(end.getUTCDate() + 1);
        range.$lt = end;
      } else {
        range.$lte = end;
      }
    }

    if (
      range.$gte &&
      (range.$lt ?? range.$lte) &&
      range.$gte.getTime() >= (range.$lt ?? range.$lte)!.getTime()
    ) {
      throw new BadRequestException(
        'La fecha inicial debe ser anterior a la fecha final',
      );
    }

    return Object.keys(range).length > 0 ? range : null;
  }

  async findAll(query: QueryBatchesDto = {}): Promise<PaginatedResult<Batch>> {
    const { page, limit } = normalizePagination(query.page, query.limit);
    const filter: Record<string, unknown> = {};

    if (query.itemId) {
      if (!isValidObjectId(query.itemId)) {
        return buildPaginatedResult([], 0, page, limit);
      }
      filter.itemId = query.itemId;
    }

    const [total, items] = await Promise.all([
      this.batchModel.countDocuments(filter).exec(),
      this.batchModel
        .find(filter)
        .sort({ _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
    ]);

    return buildPaginatedResult(items, total, page, limit);
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

  async update(
    id: string,
    updateDto: UpdateBatchDto,
    createdBy = 'system',
  ): Promise<Batch> {
    if (Object.values(updateDto).every((value) => value === undefined)) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const currentBatch = await this.findOne(id);
    const currentStatus = this.computeStatus(
      currentBatch.quantity,
      currentBatch.expirationDate,
    );

    if (currentStatus === BatchStatus.DEPLETED) {
      throw new BadRequestException(
        'No se puede modificar un lote agotado o dado de baja',
      );
    }

    const { reason, ...batchChanges } = updateDto;

    if (
      currentStatus === BatchStatus.EXPIRED &&
      (batchChanges.quantity !== 0 ||
        batchChanges.cost !== undefined ||
        batchChanges.expirationDate !== undefined ||
        batchChanges.supplierId !== undefined ||
        batchChanges.batchNumber !== undefined)
    ) {
      throw new BadRequestException(
        'Un lote caducado no puede editarse; solo puede darse de baja por merma (cantidad 0)',
      );
    }

    const hasConsumption =
      currentBatch.initialQuantity !== undefined &&
      Number(currentBatch.quantity) < Number(currentBatch.initialQuantity);

    const costChanged =
      batchChanges.cost !== undefined &&
      Number(batchChanges.cost) !== Number(currentBatch.cost);
    const supplierChanged =
      batchChanges.supplierId !== undefined &&
      String(batchChanges.supplierId ?? '') !==
        String(currentBatch.supplierId ?? '');
    const batchNumberProvided =
      batchChanges.batchNumber !== undefined &&
      batchChanges.batchNumber.trim() !== '';

    if (hasConsumption && (costChanged || supplierChanged || batchNumberProvided)) {
      throw new BadRequestException(
        'No se puede modificar el costo, proveedor o número de un lote que ya tiene consumo',
      );
    }

    const updatePayload: Record<string, unknown> = { ...batchChanges };

    if (supplierChanged && batchChanges.supplierId) {
      await this.supplierService.assertAssignable(batchChanges.supplierId);
    }

    if (batchNumberProvided) {
      const item = await this.itemService.findOne(String(currentBatch.itemId));
      const normalizedBatchNumber = this.buildBatchNumber(
        batchChanges.batchNumber,
        item?.sku,
      );
      if (hasConsumption && normalizedBatchNumber !== currentBatch.batchNumber) {
        throw new BadRequestException(
          'No se puede modificar el número de un lote que ya tiene consumo',
        );
      }
      updatePayload.batchNumber = normalizedBatchNumber;
    } else {
      delete updatePayload.batchNumber;
    }

    if (costChanged && !hasConsumption) {
      updatePayload.purchaseCost = batchChanges.cost;
    }

    if (batchChanges.expirationDate !== undefined) {
      if (!batchChanges.expirationDate) {
        const item = await this.itemService.findOne(
          String(currentBatch.itemId),
        );
        if (item?.isPerishable) {
          throw new BadRequestException(
            'La fecha de caducidad es obligatoria para insumos perecederos',
          );
        }
        updatePayload.expirationDate = null;
      } else {
        const createdAt = (currentBatch as unknown as { createdAt?: Date })
          .createdAt;
        if (createdAt) {
          const expDate = new Date(batchChanges.expirationDate);
          const expDay = Date.UTC(
            expDate.getUTCFullYear(),
            expDate.getUTCMonth(),
            expDate.getUTCDate(),
          );
          const entryDate = new Date(createdAt);
          const entryDay = Date.UTC(
            entryDate.getUTCFullYear(),
            entryDate.getUTCMonth(),
            entryDate.getUTCDate(),
          );
          if (expDay < entryDay) {
            throw new BadRequestException(
              'La fecha de caducidad no puede ser anterior a la fecha de ingreso del lote',
            );
          }
        }
      }
    }

    const nextQuantity = batchChanges.quantity ?? currentBatch.quantity;
    if (
      batchChanges.quantity !== undefined &&
      Number(nextQuantity) > Number(currentBatch.initialQuantity ?? 0)
    ) {
      updatePayload.initialQuantity = nextQuantity;
    }
    const nextExpirationDate =
      batchChanges.expirationDate !== undefined
        ? (batchChanges.expirationDate || null)
        : currentBatch.expirationDate;
    const status = this.computeStatus(nextQuantity, nextExpirationDate);

    const isCurrentlyUsable =
      currentStatus === BatchStatus.ACTIVE ||
      currentStatus === BatchStatus.EXPIRES_TODAY;
    const isNextUsable =
      status === BatchStatus.ACTIVE || status === BatchStatus.EXPIRES_TODAY;
    const currentUsableQty = isCurrentlyUsable
      ? Number(currentBatch.quantity)
      : 0;
    const nextUsableQty = isNextUsable ? Number(nextQuantity) : 0;

    if (nextUsableQty < currentUsableQty) {
      await this.assertReservedStockCovered(
        String(currentBatch.itemId),
        id,
        nextUsableQty,
      );
    }

    let updatedBatch: Batch | null;
    try {
      updatedBatch = await this.batchModel
        .findByIdAndUpdate(id, { ...updatePayload, status }, { new: true })
        .exec();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Ya existe un lote con el número '${String(updatePayload.batchNumber ?? '')}' para este item`,
        );
      }
      throw error;
    }

    if (!updatedBatch) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    const quantityDelta = Number(nextQuantity) - Number(currentBatch.quantity);
    if (quantityDelta !== 0) {
      const isExpiredWriteOff =
        currentStatus === BatchStatus.EXPIRED && Number(nextQuantity) === 0;
      await this.recordMovementSafely({
        batchId: id,
        movementType: isExpiredWriteOff
          ? StockMovementType.WASTE
          : StockMovementType.ADJUSTMENT,
        quantity: isExpiredWriteOff
          ? Number(currentBatch.quantity)
          : quantityDelta,
        reason:
          reason ??
          (isExpiredWriteOff
            ? 'Baja por caducidad de lote'
            : 'Ajuste manual de lote'),
        createdBy,
      });
    }

    await this.syncItemStockAndCost(String(currentBatch.itemId));

    return updatedBatch;
  }

  async remove(id: string, createdBy = 'system'): Promise<void> {
    const currentBatch = await this.findOne(id);
    const currentStatus = this.computeStatus(
      currentBatch.quantity,
      currentBatch.expirationDate,
    );

    if (
      currentStatus === BatchStatus.EXPIRED ||
      currentStatus === BatchStatus.DEPLETED
    ) {
      throw new BadRequestException(
        'No se puede eliminar un lote caducado o agotado por trazabilidad; regístrelo como baja por merma',
      );
    }

    if (
      currentBatch.initialQuantity !== undefined &&
      Number(currentBatch.quantity) < Number(currentBatch.initialQuantity)
    ) {
      throw new BadRequestException(
        'No se puede eliminar un lote que ya registra consumo o movimientos',
      );
    }

    const removedQuantity = Number(currentBatch.quantity);
    if (removedQuantity > 0) {
      await this.assertReservedStockCovered(
        String(currentBatch.itemId),
        id,
        0,
      );
    }

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
        createdBy,
      });
    }

    await this.syncItemStockAndCost(String(currentBatch.itemId));
  }

  /**
   * Evita que un ajuste manual o eliminación de lote deje el stock utilizable
   * total del insumo por debajo de las unidades actualmente reservadas.
   */
  private async assertReservedStockCovered(
    itemId: string,
    targetBatchId: string,
    nextTargetUsableQuantity: number,
  ): Promise<void> {
    if (!isValidObjectId(itemId)) {
      return;
    }
    const item = await this.itemService.findOne(itemId);
    const reservedStock = Number(item?.reservedStock ?? 0);
    if (reservedStock <= 0) {
      return;
    }

    const batches = await this.batchModel.find({ itemId }).exec();
    let otherUsableStock = 0;
    for (const batch of batches) {
      if (String(batch._id) === targetBatchId) {
        continue;
      }
      const status = this.computeStatus(batch.quantity, batch.expirationDate);
      if (
        (status === BatchStatus.ACTIVE ||
          status === BatchStatus.EXPIRES_TODAY) &&
        Number(batch.quantity) > 0
      ) {
        otherUsableStock += Number(batch.quantity);
      }
    }

    const projectedUsable =
      Math.round((otherUsableStock + nextTargetUsableQuantity) * 1000) / 1000;
    if (projectedUsable < reservedStock) {
      throw new ConflictException(
        `No se puede reducir o eliminar el lote porque quedarían ${projectedUsable} unidades utilizables y hay ${reservedStock} reservadas por órdenes activas`,
      );
    }
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

  /**
   * Actualiza el estado de los lotes cuya fecha de caducidad ya llegó o pasó
   * y recalcula el stock de sus items, para que un lote vencido deje de
   * contar como disponible sin esperar a que alguien lo edite.
   * Devuelve cuántos lotes cambiaron de estado.
   */
  async syncExpiredStatuses(now = new Date()): Promise<number> {
    const startOfTomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );

    const candidates = await this.batchModel
      .find({
        status: { $in: [BatchStatus.ACTIVE, BatchStatus.EXPIRES_TODAY] },
        expirationDate: { $ne: null, $lt: startOfTomorrow },
      })
      .exec();

    const affectedItemIds = new Set<string>();
    let changed = 0;

    for (const batch of candidates) {
      const status = this.computeStatus(
        batch.quantity,
        batch.expirationDate,
        now,
      );
      if (status === batch.status) {
        continue;
      }
      await this.batchModel.updateOne({ _id: batch._id }, { status }).exec();
      if (status === BatchStatus.EXPIRED && Number(batch.quantity) > 0) {
        await this.recordMovementSafely({
          batchId: String(batch._id),
          movementType: StockMovementType.WASTE,
          quantity: Number(batch.quantity),
          reason: 'Caducidad automática de lote',
          createdBy: 'system',
        });
      }
      affectedItemIds.add(String(batch.itemId));
      changed += 1;
    }

    for (const itemId of affectedItemIds) {
      try {
        await this.syncItemStockAndCost(itemId);
      } catch (error) {
        this.logger.error(
          `No se pudo recalcular el stock del item '${itemId}' tras el vencimiento de sus lotes`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return changed;
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

  /**
   * Merma manual: descuenta del lote la cantidad perdida y deja el
   * movimiento `waste`. No exige una orden; solo el lote, la cantidad y el
   * motivo. La resta es atómica, así que dos mermas simultáneas no pueden
   * dejar el lote en negativo.
   */
  async registerWaste(
    id: string,
    quantity: number,
    reason: string,
    createdBy?: string,
  ): Promise<{ batch: Batch; movement: StockMovement }> {
    const current = await this.findOne(id);
    const amount = Math.round(Number(quantity) * 1000) / 1000;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('La cantidad de la merma debe ser mayor a 0');
    }
    if (amount > Number(current.quantity)) {
      throw new UnprocessableEntityException(
        `La merma excede la cantidad del lote (disponible: ${current.quantity})`,
      );
    }

    const updated = await this.batchModel
      .findOneAndUpdate(
        { _id: id, quantity: { $gte: amount } },
        { $inc: { quantity: -amount } },
        { new: true },
      )
      .exec();
    if (!updated) {
      const latest = await this.findOne(id);
      throw new UnprocessableEntityException(
        `La merma excede la cantidad del lote (disponible: ${latest.quantity})`,
      );
    }

    updated.quantity = Math.round(Number(updated.quantity) * 1000) / 1000;
    updated.status = this.computeStatus(
      updated.quantity,
      updated.expirationDate,
    );
    await updated.save();

    const movement = await this.stockMovementService.record({
      batchId: id,
      movementType: StockMovementType.WASTE,
      quantity: amount,
      reason,
      createdBy,
    });

    await this.syncItemStockAndCost(String(updated.itemId));
    return { batch: updated, movement };
  }

  async consumeByFefo(
    itemId: string,
    quantityToConsume: number,
    referenceId?: string,
    reason = 'Consumo por orden servida',
  ): Promise<void> {
    if (
      !isValidObjectId(itemId) ||
      !Number.isFinite(quantityToConsume) ||
      quantityToConsume <= 0
    ) {
      return;
    }

    const MAX_FEFO_ATTEMPTS = 5;
    let remaining = Math.round(quantityToConsume * 1000) / 1000;

    for (
      let attempt = 0;
      attempt < MAX_FEFO_ATTEMPTS && remaining > 0;
      attempt++
    ) {
      const rawBatches = await this.batchModel
        .find({ itemId })
        .sort({ expirationDate: 1, _id: 1 })
        .exec();

      // Lotes con fecha de caducidad se consumen primero (FEFO); los lotes sin
      // caducidad (no perecederos) van después en orden FIFO por _id.
      const batches = [...rawBatches].sort((a, b) => {
        const aTime = a.expirationDate
          ? new Date(a.expirationDate).getTime()
          : Number.POSITIVE_INFINITY;
        const bTime = b.expirationDate
          ? new Date(b.expirationDate).getTime()
          : Number.POSITIVE_INFINITY;
        if (aTime !== bTime) return aTime - bTime;
        return String(a._id).localeCompare(String(b._id));
      });

      let hadContention = false;

      for (const batch of batches) {
        if (remaining <= 0) {
          break;
        }
        const status = this.computeStatus(batch.quantity, batch.expirationDate);
        if (status === BatchStatus.EXPIRED) {
          continue;
        }
        if (
          (status !== BatchStatus.ACTIVE &&
            status !== BatchStatus.EXPIRES_TODAY) ||
          batch.quantity <= 0
        ) {
          continue;
        }

        const take = Math.round(Math.min(remaining, batch.quantity) * 1000) / 1000;
        const updated = await this.batchModel
          .findOneAndUpdate(
            { _id: batch._id, quantity: { $gte: take } },
            { $inc: { quantity: -take } },
            { new: true },
          )
          .exec();

        if (!updated) {
          // Otro consumo concurrente modificó este lote: releemos en el
          // siguiente intento para respetar estrictamente el orden FEFO.
          hadContention = true;
          break;
        }

        const nextQuantity = Math.round(Math.max(0, Number(updated.quantity)) * 1000) / 1000;
        const nextStatus = this.computeStatus(
          nextQuantity,
          updated.expirationDate,
        );

        if (nextStatus === BatchStatus.DEPLETED) {
          await this.batchModel
            .updateOne(
              { _id: updated._id, quantity: { $lte: 0.0005 } },
              { $set: { status: BatchStatus.DEPLETED } },
            )
            .exec();
        } else if (nextStatus !== updated.status) {
          await this.batchModel
            .updateOne(
              { _id: updated._id, quantity: { $gt: 0 } },
              { $set: { status: nextStatus } },
            )
            .exec();
        }

        await this.recordMovementSafely({
          batchId: String(updated._id),
          movementType: StockMovementType.OUT,
          quantity: take,
          referenceId: referenceId ?? null,
          reason,
        });

        remaining = Math.round((remaining - take) * 1000) / 1000;
      }

      if (!hadContention) {
        break;
      }
    }

    await this.syncItemStockAndCost(itemId);
  }

  /**
   * Sugerencia de lotes que FEFO asignaría a una cantidad, sin mutar nada.
   * Se usa para informar a Órdenes con qué lote preparar al reservar. Es
   * orientativa: la trazabilidad definitiva se fija al consumir (`order.served`).
   * Nunca lanza por stock insuficiente: devuelve solo lo alcanzable.
   */
  async previewFefoAllocation(
    itemId: string,
    quantity: number,
  ): Promise<FefoBatchAllocation[]> {
    if (
      !isValidObjectId(itemId) ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return [];
    }

    let remaining = Math.round(quantity * 1000) / 1000;
    const allocations: FefoBatchAllocation[] = [];
    const rawBatches = await this.batchModel
      .find({ itemId })
      .sort({ expirationDate: 1, _id: 1 })
      .exec();

    const batches = [...rawBatches].sort((a, b) => {
      const aTime = a.expirationDate
        ? new Date(a.expirationDate).getTime()
        : Number.POSITIVE_INFINITY;
      const bTime = b.expirationDate
        ? new Date(b.expirationDate).getTime()
        : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return String(a._id).localeCompare(String(b._id));
    });

    for (const batch of batches) {
      if (remaining <= 0) {
        break;
      }
      const status = this.computeStatus(batch.quantity, batch.expirationDate);
      if (
        (status !== BatchStatus.ACTIVE &&
          status !== BatchStatus.EXPIRES_TODAY) ||
        batch.quantity <= 0
      ) {
        continue;
      }

      const take = Math.round(Math.min(remaining, batch.quantity) * 1000) / 1000;
      allocations.push({
        batchId: String(batch._id),
        batchNumber: batch.batchNumber,
        expirationDate: batch.expirationDate
          ? new Date(batch.expirationDate).toISOString()
          : '',
        quantity: take,
      });

      remaining = Math.round((remaining - take) * 1000) / 1000;
    }

    return allocations;
  }
}
