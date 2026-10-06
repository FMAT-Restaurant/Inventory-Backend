import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateBatchDto } from './create-batch.dto.js';

// Usamos OmitType para quitar los campos que NO deben editarse nunca
// y PartialType para que el resto de campos sean opcionales.
export class UpdateBatchDto extends PartialType(
  OmitType(CreateBatchDto, ['batchNumber', 'ingredientId', 'status', 'supplierId'] as const),
) {}
