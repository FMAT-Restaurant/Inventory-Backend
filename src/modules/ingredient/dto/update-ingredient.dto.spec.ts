import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateIngredientDto } from './update-ingredient.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: UpdateIngredientDto,
  data: '',
};

interface DtoError {
  property: string;
  messages: string[];
}

async function validateDto(payload: Record<string, unknown>): Promise<DtoError[]> {
  const errors = await validate(plainToInstance(UpdateIngredientDto, payload));

  return errors.map((error) => ({
    property: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}

function transform(payload: Record<string, unknown>): Promise<UpdateIngredientDto> {
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

describe('UpdateIngredientDto', () => {
  it('debería estar definido', () => {
    expect(UpdateIngredientDto).toBeDefined();
  });
});

describe('campos opcionales', () => {
  it('debería aceptar un payload vacío', async () => {
    expect(await validateDto({})).toEqual([]);
  });

  it('debería aceptar un payload con un solo campo', async () => {
    expect(await validateDto({ name: 'Tomate perita' })).toEqual([]);
  });

  it.each([
    'sku',
    'name',
    'description',
    'category',
    'unit',
    'minStock',
    'isPerishable',
    'storageCondition',
    'averageCost',
    'supplierIdSugested',
  ])('debería validar el campo %s de forma opcional', async (field) => {
    expect(await validateDto({ [field]: undefined })).toEqual([]);
  });

  it('debería aceptar un payload completo', async () => {
    const payload = {
      sku: 'ING-0002',
      name: 'Tomate perita',
      description: 'Tomate perita para salsas',
      category: 'Verduras',
      unit: 'kg',
      minStock: 15,
      isPerishable: true,
      storageCondition: 'Ambiente',
      averageCost: 20,
      supplierIdSugested: '507f1f77bcf86cd799439011',
    };

    await expect(transform(payload)).resolves.toMatchObject(payload);
  });
});

describe('reglas de validación heredadas', () => {
  it('debería rechazar un minStock negativo', async () => {
    const errors = await validateDto({ minStock: -1 });

    expect(errors[0].property).toBe('minStock');
    expect(errors[0].messages).toContain('minStock must not be less than 0');
  });

  it('debería rechazar un averageCost negativo', async () => {
    const errors = await validateDto({ averageCost: -1 });

    expect(errors[0].property).toBe('averageCost');
  });

  it('debería rechazar un isPerishable que no es booleano', async () => {
    const errors = await validateDto({ isPerishable: 'sí' });

    expect(errors[0].property).toBe('isPerishable');
  });

  it('debería rechazar un sku vacío', async () => {
    const errors = await validateDto({ sku: '' });

    expect(errors[0].property).toBe('sku');
  });

  it('debería rechazar un supplierIdSugested que no es un ObjectId', async () => {
    const errors = await validateDto({ supplierIdSugested: 'no-es-un-objectid' });

    expect(errors[0].property).toBe('supplierIdSugested');
  });
});

describe('whitelist', () => {
  it.each(['isActive', 'totalStock', 'reservedStock', 'stock', 'cost'])(
    'debería rechazar la propiedad no declarada %s',
    async (property) => {
      const messages = await pipeErrorMessages({ [property]: 'valor' });

      expect(messages).toContain(`property ${property} should not exist`);
    },
  );
});
