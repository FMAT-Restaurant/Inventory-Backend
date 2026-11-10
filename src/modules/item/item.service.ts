import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { Item } from './schemas/item.schema.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { QueryItemsDto } from './dto/query-items.dto.js';
import {
  ITEM_CHANGED_EVENT,
  ItemChangeEmitter,
} from './item-change.emitter.js';
import { SupplierService } from '../suppliers/supplier.service.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

// Los documentos creados antes de la baja lógica no tienen el campo 'isActive',
// por eso se usa '$ne: false' en lugar de 'true' para no ocultarlos.
const ACTIVE_ITEM_FILTER = { isActive: { $ne: false } };

// Índices únicos anteriores: distinguían mayúsculas y seguían bloqueando el
// SKU y el nombre de los items dados de baja.
const LEGACY_UNIQUE_INDEXES = ['sku_1', 'name_1'];

const UNIQUE_FIELD_LABELS = { sku: 'el SKU', name: 'el nombre' } as const;
type UniqueField = keyof typeof UNIQUE_FIELD_LABELS;

/**
 * Regla que puede impedir la baja de un item. Devuelve el motivo cuando el
 * item sigue en uso o `null` cuando no hay impedimento.
 */
export type ItemRemovalGuard = (itemId: string) => Promise<string | null>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class ItemService implements OnModuleInit {
  private readonly logger = new Logger(ItemService.name);
  private readonly removalGuards: ItemRemovalGuard[] = [];

  constructor(
    @InjectModel(Item.name) private itemModel: Model<Item>,
    private readonly changeEmitter: ItemChangeEmitter,
    private readonly supplierService: SupplierService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const indexName of LEGACY_UNIQUE_INDEXES) {
      try {
        await this.itemModel.collection?.dropIndex(indexName);
      } catch {
        // El índice legado ya no existe; no se requiere acción.
      }
    }

    try {
      // Los índices únicos solo cubren items con `isActive: true`; los
      // documentos anteriores a la baja lógica no tienen el campo.
      await this.itemModel
        .updateMany(
          { isActive: { $exists: false } },
          { $set: { isActive: true } },
        )
        .exec();
    } catch (error) {
      this.logger.warn(
        `No se pudo normalizar 'isActive' en items existentes: ${error}`,
      );
    }
  }

  /**
   * Otros módulos registran aquí sus reglas (recetas, reservas) sin que el
   * módulo de items dependa de ellos.
   */
  registerRemovalGuard(guard: ItemRemovalGuard): void {
    this.removalGuards.push(guard);
  }

  async create(createDto: CreateItemDto): Promise<Item> {
    await this.assertUnique(createDto);
    if (createDto.supplierIdSugested) {
      await this.supplierService.assertAssignable(createDto.supplierIdSugested);
    }
    const newItem = new this.itemModel(createDto);

    try {
      const saved = await newItem.save(); // Guarda en MongoDB
      this.changeEmitter.emit(ITEM_CHANGED_EVENT, {
        itemId: (saved._id as Types.ObjectId).toString(),
        action: 'created',
      });
      return saved;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw this.duplicateConflict(error, createDto);
      }
      throw error;
    }
  }

  /**
   * SKU y nombre son únicos entre los items activos, sin distinguir
   * mayúsculas. Un item dado de baja libera ambos.
   */
  private async assertUnique(
    values: { sku?: string; name?: string },
    excludeId?: string,
  ): Promise<void> {
    for (const field of Object.keys(UNIQUE_FIELD_LABELS) as UniqueField[]) {
      const value = values[field]?.trim();
      if (!value) {
        continue;
      }

      const filter: FilterQuery<Item> = {
        ...ACTIVE_ITEM_FILTER,
        [field]: { $regex: `^${escapeRegExp(value)}$`, $options: 'i' },
      };
      if (excludeId) {
        filter._id = { $ne: excludeId };
      }

      const existing = await this.itemModel.findOne(filter).exec();
      if (existing) {
        throw new ConflictException(
          `Ya existe un item con ${UNIQUE_FIELD_LABELS[field]} '${value}'`,
        );
      }
    }
  }

  /**
   * Un item puede conservar un proveedor sugerido que ya fue dado de baja,
   * pero solo puede cambiarse a un proveedor activo.
   */
  private async assertSupplierChangeAllowed(
    id: string,
    supplierId?: string | null,
  ): Promise<void> {
    if (!supplierId) {
      return;
    }

    const current = await this.findOne(id);
    if (String(current.supplierIdSugested ?? '') === supplierId) {
      return;
    }

    await this.supplierService.assertAssignable(supplierId);
  }

  private duplicateConflict(
    error: unknown,
    values: { sku?: string; name?: string },
  ): ConflictException {
    const keyPattern =
      (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
    const field: UniqueField = 'sku' in keyPattern ? 'sku' : 'name';
    return new ConflictException(
      `Ya existe un item con ${UNIQUE_FIELD_LABELS[field]} '${values[field] ?? ''}'`,
    );
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code: number }).code === DUPLICATE_KEY_ERROR_CODE
    );
  }

  async findAll(query?: QueryItemsDto): Promise<Item[]> {
    const filter: FilterQuery<Item> = { ...ACTIVE_ITEM_FILTER };
    const term = query?.q?.trim();

    if (term) {
      filter.name = { $regex: escapeRegExp(term), $options: 'i' };
    }

    return this.itemModel.find(filter).exec();
  }

  async findOne(id: string): Promise<Item> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    const item = await this.itemModel
      .findOne({ _id: id, ...ACTIVE_ITEM_FILTER })
      .exec();
    if (!item) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    return item;
  }

  async update(id: string, updateDto: UpdateItemDto): Promise<Item> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    if (Object.keys(updateDto).length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    await this.assertUnique(updateDto, id);
    await this.assertSupplierChangeAllowed(id, updateDto.supplierIdSugested);

    try {
      // Se usa findOneAndUpdate (y no findByIdAndUpdate) porque este último
      // espera un id y descarta silenciosamente cualquier condición extra
      // del filtro, con lo que se actualizarían también los items
      // desactivados.
      const updated = await this.itemModel
        .findOneAndUpdate({ _id: id, ...ACTIVE_ITEM_FILTER }, updateDto, {
          new: true,
          runValidators: true,
        })
        .exec();

      if (!updated) {
        throw new NotFoundException(`Item con id '${id}' no encontrado`);
      }

      this.changeEmitter.emit(ITEM_CHANGED_EVENT, {
        itemId: id,
        action: 'updated',
      });

      return updated;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw this.duplicateConflict(error, updateDto);
      }
      throw error;
    }
  }

  async updateStockAndCost(
    id: string,
    totalStock: number,
    averageCost?: number,
  ): Promise<Item> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    const updateData: { totalStock: number; averageCost?: number } = {
      totalStock: Math.max(0, totalStock),
    };
    if (averageCost !== undefined) {
      updateData.averageCost = Math.max(0, averageCost);
    }

    const updated = await this.itemModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    this.changeEmitter.emit(ITEM_CHANGED_EVENT, {
      itemId: id,
      action: 'updated',
    });

    return updated;
  }

  /**
   * Reserva stock de forma atómica solo si hay disponibilidad suficiente.
   * Devuelve null cuando la cantidad solicitada excede el stock disponible.
   */
  async reserveStock(id: string, quantity: number): Promise<Item | null> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    const roundedQuantity = Math.round(quantity * 1000) / 1000;
    if (!Number.isFinite(roundedQuantity) || roundedQuantity <= 0) {
      throw new BadRequestException('La cantidad a reservar debe ser mayor a 0');
    }

    const updated = await this.itemModel
      .findOneAndUpdate(
        {
          _id: id,
          ...ACTIVE_ITEM_FILTER,
          $expr: {
            $gte: [
              {
                $subtract: [
                  { $ifNull: ['$totalStock', 0] },
                  { $ifNull: ['$reservedStock', 0] },
                ],
              },
              roundedQuantity,
            ],
          },
        },
        { $inc: { reservedStock: roundedQuantity } },
        { new: true },
      )
      .exec();

    if (updated) {
      this.changeEmitter.emit(ITEM_CHANGED_EVENT, {
        itemId: id,
        action: 'updated',
      });
    }

    return updated ?? null;
  }

  /**
   * Ajusta el stock reservado sin permitir valores negativos. Se usa para
   * liberar reservas y para compensar operaciones parciales.
   */
  async adjustReservedStock(id: string, delta: number): Promise<Item> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    const roundedDelta = Math.round(delta * 1000) / 1000;
    if (!Number.isFinite(roundedDelta) || roundedDelta === 0) {
      return this.findOne(id);
    }

    const updated =
      roundedDelta > 0
        ? await this.itemModel
            .findByIdAndUpdate(
              id,
              { $inc: { reservedStock: roundedDelta } },
              { new: true },
            )
            .exec()
        : await this.itemModel
            .findOneAndUpdate(
              {
                _id: id,
                $expr: {
                  $gte: [
                    { $ifNull: ['$reservedStock', 0] },
                    Math.abs(roundedDelta),
                  ],
                },
              },
              { $inc: { reservedStock: roundedDelta } },
              { new: true },
            )
            .exec();

    if (!updated) {
      const exists = await this.itemModel.exists({ _id: id }).exec();
      if (!exists) {
        throw new NotFoundException(`Item con id '${id}' no encontrado`);
      }
      throw new ConflictException(
        `El item '${id}' no tiene suficiente stock reservado para liberar`,
      );
    }

    this.changeEmitter.emit(ITEM_CHANGED_EVENT, {
      itemId: id,
      action: 'updated',
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    // Un item en uso (recetas, reservas activas) no puede darse de baja.
    for (const guard of this.removalGuards) {
      const reason = await guard(id);
      if (reason) {
        throw new ConflictException(reason);
      }
    }

    // Baja lógica: el documento se conserva y solo se marca como inactivo.
    // findOneAndUpdate mantiene el filtro de items activos, así que un
    // item ya desactivado devuelve 404 en lugar de 200.
    const updated = await this.itemModel
      .findOneAndUpdate(
        { _id: id, ...ACTIVE_ITEM_FILTER },
        { isActive: false },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
    }

    this.changeEmitter.emit(ITEM_CHANGED_EVENT, {
      itemId: id,
      action: 'removed',
    });
  }
}
