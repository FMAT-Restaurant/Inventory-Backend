import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { Supplier } from './schemas/supplier.schema.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { QuerySuppliersDto } from './dto/query-suppliers.dto.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

// Índices únicos anteriores: distinguían mayúsculas o seguían bloqueando el
// nombre de los proveedores dados de baja.
const LEGACY_UNIQUE_INDEXES = ['name_1', 'name_unique_ci'];

// Los documentos creados antes de la baja lógica no tienen 'isActive', por
// eso se usa '$ne: false' en lugar de 'true' para no ocultarlos.
const ACTIVE_SUPPLIER_FILTER = { isActive: { $ne: false } };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class SupplierService implements OnModuleInit {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<Supplier>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const indexName of LEGACY_UNIQUE_INDEXES) {
      try {
        await this.supplierModel.collection?.dropIndex(indexName);
      } catch {
        // El índice legado ya no existe; no se requiere acción.
      }
    }

    try {
      // El índice único solo cubre proveedores con `isActive: true`; los
      // documentos anteriores a la baja lógica no tienen el campo.
      await this.supplierModel
        .updateMany(
          { isActive: { $exists: false } },
          { $set: { isActive: true } },
        )
        .exec();
    } catch (error) {
      this.logger.warn(
        `No se pudo normalizar 'isActive' en proveedores existentes: ${error}`,
      );
    }
  }

  // El nombre es único entre proveedores activos, sin distinguir mayúsculas.
  private async assertUniqueName(
    name: string | undefined,
    excludeId?: string,
  ): Promise<void> {
    const value = name?.trim();
    if (!value) {
      return;
    }

    const filter: FilterQuery<Supplier> = {
      ...ACTIVE_SUPPLIER_FILTER,
      name: { $regex: `^${escapeRegExp(value)}$`, $options: 'i' },
    };
    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const existing = await this.supplierModel.findOne(filter).exec();
    if (existing) {
      throw this.duplicateName(value);
    }
  }

  private duplicateName(name?: string): ConflictException {
    return new ConflictException(
      `Ya existe un proveedor con el nombre '${name ?? ''}'`,
    );
  }

  async create(createDto: CreateSupplierDto): Promise<Supplier> {
    await this.assertUniqueName(createDto.name);
    const newSupplier = new this.supplierModel(createDto);
    try {
      return await newSupplier.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw this.duplicateName(createDto.name);
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

  /**
   * Lista los proveedores activos. Con `includeInactive` se incluyen también
   * los dados de baja, para poder mostrar el nombre de los que siguen
   * asignados a lotes o items.
   */
  async findAll(query: QuerySuppliersDto = {}): Promise<Supplier[]> {
    const filter = query.includeInactive ? {} : ACTIVE_SUPPLIER_FILTER;
    return this.supplierModel.find(filter).exec();
  }

  /**
   * Verifica que el proveedor exista y esté activo antes de asignarlo a un
   * lote o a un item.
   */
  async assertAssignable(id: string): Promise<void> {
    const supplier = isValidObjectId(id)
      ? await this.supplierModel
          .findOne({ _id: id, ...ACTIVE_SUPPLIER_FILTER })
          .exec()
      : null;
    if (!supplier) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }
  }

  // Devuelve también proveedores dados de baja (con `isActive: false`): los
  // lotes e items que los referencian necesitan seguir mostrando su nombre.
  async findOne(id: string): Promise<Supplier> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }

    const supplier = await this.supplierModel.findById(id).exec();
    if (!supplier) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }

    return supplier;
  }

  async update(id: string, updateDto: UpdateSupplierDto): Promise<Supplier> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }

    if (Object.keys(updateDto).length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    await this.assertUniqueName(updateDto.name, id);

    try {
      // findOneAndUpdate (y no findByIdAndUpdate) para conservar el filtro de
      // activos: un proveedor dado de baja no se puede editar.
      const updatedSupplier = await this.supplierModel
        .findOneAndUpdate({ _id: id, ...ACTIVE_SUPPLIER_FILTER }, updateDto, {
          new: true,
        })
        .exec();

      if (!updatedSupplier) {
        throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
      }

      return updatedSupplier;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw this.duplicateName(updateDto.name);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }

    // Baja lógica: el documento se conserva y solo se marca como inactivo.
    const updated = await this.supplierModel
      .findOneAndUpdate(
        { _id: id, ...ACTIVE_SUPPLIER_FILTER },
        { isActive: false },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }
  }
}
