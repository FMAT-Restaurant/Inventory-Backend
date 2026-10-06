import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Batch } from './schemas/batch.schema.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { IngredientService } from '../ingredient/ingredient.service.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class BatchService {
  constructor(
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
    private readonly ingredientService: IngredientService,
  ) {}

  async create(createDto: CreateBatchDto): Promise<Batch> {
    await this.ingredientService.findOne(createDto.ingredientId);
    const newBatch = new this.batchModel(createDto);
    try {
      return await newBatch.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Ya existe un lote con el número '${createDto.batchNumber}'`,
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

  async findAll(): Promise<Batch[]> {
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
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    const updatedBatch = await this.batchModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();

    if (!updatedBatch) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    return updatedBatch;
  }

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }

    const result = await this.batchModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Lote con id '${id}' no encontrado`);
    }
  }
}
