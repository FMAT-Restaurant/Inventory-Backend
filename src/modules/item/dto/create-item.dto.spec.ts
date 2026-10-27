import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from './create-item.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: CreateItemDto,
  data: '',
};

const validPayload = {
  sku: 'ING-0001',
  name: 'Tomate',
  category: 'Verduras',
  unit: 'kg',
  minStock: 10,
  storageCondition: 'Refrigerado',
};

interface DtoError {
  property: string;
  messages: string[];
}

async function validateDto(
  payload: Record<string, unknown>,
): Promise<DtoError[]> {
  const errors = await validate(plainToInstance(CreateItemDto, payload));

  return errors.map((error) => ({
    property: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}

function transform(payload: Record<string, unknown>): Promise<CreateItemDto> {
  return pipe.transform(payload, metadata);
}

async function pipeErrorMessages(
  payload: Record<string, unknown>,
): Promise<string[]> {
  try {
    await transform(payload);
    return [];
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as {
      message?: string[];
    };

    return response.message ?? [];
  }
}

describe('CreateItemDto', () => {
  it('debería estar definido', () => {
    expect(CreateItemDto).toBeDefined();
  });
});

describe('campos requeridos', () => {
  it.each(['sku', 'name', 'category', 'unit', 'minStock', 'storageCondition'])(
    'debería fallar cuando falta %s',
    async (field) => {
      const payload: Record<string, unknown> = { ...validPayload };
      delete payload[field];

      const errors = await validateDto(payload);

      expect(errors.map((error) => error.property)).toContain(field);
    },
  );

  it('debería rechazar el payload con un campo faltante', async () => {
    await expect(
      transform({
        name: 'Tomate',
        category: 'Verduras',
        unit: 'kg',
        minStock: 10,
        storageCondition: 'Refrigerado',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debería aceptar un payload completo', async () => {
    await expect(transform(validPayload)).resolves.toMatchObject(validPayload);
  });
});

describe('minStock', () => {
  it('debería rechazar un minStock negativo', async () => {
    const errors = await validateDto({ ...validPayload, minStock: -1 });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('minStock');
    expect(errors[0].messages).toContain('minStock must not be less than 0');
  });

  it('debería aceptar un minStock igual a cero', async () => {
    expect(await validateDto({ ...validPayload, minStock: 0 })).toEqual([]);
  });

  it('debería rechazar un minStock numérico en texto', async () => {
    const errors = await validateDto({ ...validPayload, minStock: '5' });

    expect(errors[0].property).toBe('minStock');
    expect(errors[0].messages).toContain(
      'minStock must be a number conforming to the specified constraints',
    );
  });
});

describe('description', () => {
  it('debería ser opcional', async () => {
    expect(await validateDto(validPayload)).toEqual([]);
  });

  it('debería aceptar un texto', async () => {
    const result = await transform({
      ...validPayload,
      description: 'Tomate perita para salsas',
    });

    expect(result).toMatchObject({
      description: 'Tomate perita para salsas',
    });
  });

  it('debería rechazar un valor numérico', async () => {
    const errors = await validateDto({ ...validPayload, description: 42 });

    expect(errors[0].property).toBe('description');
  });
});

describe('isPerishable', () => {
  it('debería ser opcional', async () => {
    expect(await validateDto(validPayload)).toEqual([]);
  });

  it('debería aceptar un booleano', async () => {
    expect(await validateDto({ ...validPayload, isPerishable: true })).toEqual(
      [],
    );
  });

  it('debería rechazar un valor que no es booleano', async () => {
    const errors = await validateDto({ ...validPayload, isPerishable: 'sí' });

    expect(errors[0].property).toBe('isPerishable');
    expect(errors[0].messages).toContain(
      'isPerishable must be a boolean value',
    );
  });
});

describe('averageCost', () => {
  it('debería ser opcional', async () => {
    expect(await validateDto(validPayload)).toEqual([]);
  });

  it('debería aceptar un costo positivo', async () => {
    expect(await validateDto({ ...validPayload, averageCost: 18.5 })).toEqual(
      [],
    );
  });

  it('debería rechazar un costo negativo', async () => {
    const errors = await validateDto({ ...validPayload, averageCost: -1 });

    expect(errors[0].property).toBe('averageCost');
    expect(errors[0].messages).toContain('averageCost must not be less than 0');
  });
});

describe('supplierIdSugested', () => {
  it('debería ser opcional', async () => {
    expect(await validateDto(validPayload)).toEqual([]);
  });

  it('debería aceptar un ObjectId válido', async () => {
    const supplierIdSugested = '507f1f77bcf86cd799439011';
    const result = await transform({ ...validPayload, supplierIdSugested });

    expect(result).toMatchObject({ supplierIdSugested });
  });

  it('debería rechazar un identificador numérico', async () => {
    const errors = await validateDto({
      ...validPayload,
      supplierIdSugested: 12345,
    });

    expect(errors[0].property).toBe('supplierIdSugested');
  });

  it('debería rechazar un texto que no es un ObjectId', async () => {
    const errors = await validateDto({
      ...validPayload,
      supplierIdSugested: 'no-es-un-objectid',
    });

    expect(errors[0].property).toBe('supplierIdSugested');
    expect(errors[0].messages).toContain(
      'supplierIdSugested must be a mongodb id',
    );
  });
});

describe('whitelist', () => {
  it.each(['totalStock', 'reservedStock', 'isActive', 'stock', 'cost', 'hack'])(
    'debería rechazar la propiedad no declarada %s',
    async (property) => {
      const messages = await pipeErrorMessages({
        ...validPayload,
        [property]: 'valor',
      });

      expect(messages).toContain(`property ${property} should not exist`);
    },
  );
});

describe('transform', () => {
  it('debería conservar un minStock numérico', async () => {
    const result = await transform({ ...validPayload, minStock: 25 });

    expect(result.minStock).toBe(25);
  });

  it('debería conservar el resto de campos sin transformarlos', async () => {
    const result = await transform(validPayload);

    expect(result.sku).toBe('ING-0001');
    expect(result.name).toBe('Tomate');
    expect(result.unit).toBe('kg');
    expect(result.category).toBe('Verduras');
    expect(result.storageCondition).toBe('Refrigerado');
  });
});
