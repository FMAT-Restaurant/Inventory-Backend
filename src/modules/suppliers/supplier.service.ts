import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Supplier } from './schemas/supplier.schema.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class SupplierService {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<Supplier>,
  ) {}

  async create(createDto: CreateSupplierDto): Promise<Supplier> {
    const newSupplier = new this.supplierModel(createDto);
    try {
      return await newSupplier.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Ya existe un proveedor con el nombre '${createDto.name}'`,
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

  async findAll(): Promise<Supplier[]> {
    return this.supplierModel.find().exec();
  }

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

    const updatedSupplier = await this.supplierModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();

    if (!updatedSupplier) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }

    return updatedSupplier;
  }

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }

    const result = await this.supplierModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Proveedor con id '${id}' no encontrado`);
    }
  }
}
