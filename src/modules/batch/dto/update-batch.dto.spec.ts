import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBatchDto } from './update-batch.dto.js';

describe('UpdateBatchDto', () => {
  it('permite quantity = 0 para ajustes o bajas', async () => {
    const dto = plainToInstance(UpdateBatchDto, {
      quantity: 0,
      reason: 'Conteo físico en cero',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza quantity negativa', async () => {
    const dto = plainToInstance(UpdateBatchDto, { quantity: -2 });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('quantity');
  });

  it('rechaza cost = 0 o negativo', async () => {
    const zeroCost = plainToInstance(UpdateBatchDto, { cost: 0 });
    const negCost = plainToInstance(UpdateBatchDto, { cost: -10 });

    expect((await validate(zeroCost)).map((e) => e.property)).toContain('cost');
    expect((await validate(negCost)).map((e) => e.property)).toContain('cost');
  });

  it('permite supplierId ObjectId o null y batchNumber', async () => {
    const valid = plainToInstance(UpdateBatchDto, {
      supplierId: '60d5ec9af682fbd39a1b865c',
      batchNumber: 'LOTE-CORREGIDO',
    });
    const cleared = plainToInstance(UpdateBatchDto, { supplierId: null });
    const invalid = plainToInstance(UpdateBatchDto, {
      supplierId: 'no-es-object-id',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(cleared)).toHaveLength(0);
    expect((await validate(invalid)).map((e) => e.property)).toContain(
      'supplierId',
    );
  });
});
