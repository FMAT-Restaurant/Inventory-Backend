import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryItemsDto } from './query-items.dto.js';

async function validateDto(payload: Record<string, unknown>) {
  return validate(plainToInstance(QueryItemsDto, payload));
}

describe('QueryItemsDto', () => {
  it('debería estar definido', () => {
    expect(QueryItemsDto).toBeDefined();
  });

  it('debería permitir omitir q', async () => {
    expect(await validateDto({})).toEqual([]);
  });

  it('debería aceptar un término de búsqueda', async () => {
    expect(await validateDto({ q: 'tomate' })).toEqual([]);
  });

  it('debería rechazar un valor que no sea texto', async () => {
    const errors = await validateDto({ q: 123 });

    expect(errors.map((error) => error.property)).toContain('q');
  });
});
