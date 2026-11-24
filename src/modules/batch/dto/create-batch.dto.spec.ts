import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBatchDto } from './create-batch.dto.js';

describe('CreateBatchDto', () => {
  const validPayload = {
    batchNumber: 'LOTE-2026-001',
    itemId: '60d5ec9af682fbd39a1b865b',
    quantity: 10,
    expirationDate: '2026-12-31',
    supplierId: '60d5ec9af682fbd39a1b865c',
    cost: 25.5,
  };

  it('acepta un payload válido', async () => {
    const dto = plainToInstance(CreateBatchDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza cost = 0 y cost negativo (TC-07-05)', async () => {
    const zeroCost = plainToInstance(CreateBatchDto, {
      ...validPayload,
      cost: 0,
    });
    const negCost = plainToInstance(CreateBatchDto, {
      ...validPayload,
      cost: -5,
    });

    expect((await validate(zeroCost)).map((e) => e.property)).toContain('cost');
    expect((await validate(negCost)).map((e) => e.property)).toContain('cost');
  });

  it('rechaza quantity = 0 y quantity negativa', async () => {
    const zeroQty = plainToInstance(CreateBatchDto, {
      ...validPayload,
      quantity: 0,
    });
    const negQty = plainToInstance(CreateBatchDto, {
      ...validPayload,
      quantity: -1,
    });

    expect((await validate(zeroQty)).map((e) => e.property)).toContain(
      'quantity',
    );
    expect((await validate(negQty)).map((e) => e.property)).toContain(
      'quantity',
    );
  });

  it('rechaza itemId que no sea ObjectId', async () => {
    const dto = plainToInstance(CreateBatchDto, {
      ...validPayload,
      itemId: 'no-es-object-id',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('itemId');
  });
});
