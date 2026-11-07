import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProcessedEvent } from './schemas/processed-event.schema.js';

const DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class ProcessedEventService {
  constructor(
    @InjectModel(ProcessedEvent.name)
    private readonly processedEventModel: Model<ProcessedEvent>,
  ) {}

  async isProcessed(consumer: string, eventId: string): Promise<boolean> {
    const existing = await this.processedEventModel
      .exists({ consumer, eventId })
      .exec();
    return existing !== null;
  }

  async markProcessed(consumer: string, eventId: string): Promise<void> {
    try {
      await this.processedEventModel.create({ consumer, eventId });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        return;
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
}
