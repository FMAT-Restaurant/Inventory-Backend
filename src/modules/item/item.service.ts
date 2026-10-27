import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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

const DUPLICATE_KEY_ERROR_CODE = 11000;

// Los documentos creados antes de la baja lógica no tienen el campo 'isActive',
// por eso se usa '$ne: false' en lugar de 'true' para no ocultarlos.
const ACTIVE_ITEM_FILTER = { isActive: { $ne: false } };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class ItemService {
  constructor(
    @InjectModel(Item.name) private itemModel: Model<Item>,
    private readonly changeEmitter: ItemChangeEmitter,
  ) {}

  async create(createDto: CreateItemDto): Promise<Item> {
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
        throw new ConflictException(
          `Ya existe un item con el nombre '${createDto.name}'`,
        );
      }
      throw error;
    }
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
        throw new ConflictException(
          `Ya existe un item con el nombre '${updateDto.name}'`,
        );
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

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Item con id '${id}' no encontrado`);
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
