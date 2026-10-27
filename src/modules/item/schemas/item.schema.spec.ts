import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Model } from 'mongoose';
import { EstadoUmbral, Item, ItemSchema } from './item.schema.js';

const MODEL_NAME = 'ItemSchemaSpec';

let ItemModel: Model<Item>;

const validItem = {
  sku: 'ING-0001',
  name: 'Tomate',
  category: 'Verduras',
  unit: 'kg',
  storageCondition: 'Refrigerado',
};

function build(overrides: Record<string, unknown> = {}): Item {
  return new ItemModel({ ...validItem, ...overrides });
}

function validationPaths(document: Item): string[] {
  return Object.keys(document.validateSync()?.errors ?? {});
}

beforeAll(() => {
  ItemModel =
    (mongoose.models[MODEL_NAME] as Model<Item> | undefined) ??
    (mongoose.model(MODEL_NAME, ItemSchema) as Model<Item>);
});

afterAll(() => {
  mongoose.deleteModel(MODEL_NAME);
});

describe('ItemSchema', () => {
  it('debería estar definido', () => {
    expect(ItemSchema).toBeDefined();
  });

  it('debería declarar name como único', () => {
    expect(ItemSchema.path('name').options.unique).toBe(true);
  });

  it('debería referenciar la colección Supplier en supplierIdSugested', () => {
    expect(ItemSchema.path('supplierIdSugested').options.ref).toBe('Supplier');
  });

  it('debería tener timestamps habilitados', () => {
    expect(ItemSchema.options.timestamps).toBe(true);
  });

  it('debería exponer los virtuals en toJSON y toObject', () => {
    expect(ItemSchema.options.toJSON).toEqual({ virtuals: true });
    expect(ItemSchema.options.toObject).toEqual({ virtuals: true });
  });
});

describe('defaults', () => {
  it('debería aplicar el valor por defecto 0 en los campos numéricos', () => {
    const item = build();

    expect(item.minStock).toBe(0);
    expect(item.averageCost).toBe(0);
    expect(item.reservedStock).toBe(0);
    expect(item.totalStock).toBe(0);
  });

  it('debería aplicar el valor por defecto null en supplierIdSugested', () => {
    expect(build().supplierIdSugested).toBeNull();
  });

  it('debería aplicar el valor por defecto false en isPerishable', () => {
    expect(build().isPerishable).toBe(false);
  });

  it('debería aplicar el valor por defecto true en isActive', () => {
    expect(build().isActive).toBe(true);
  });
});

describe('required', () => {
  it.each(['sku', 'name', 'category', 'unit', 'storageCondition'])(
    'debería exigir el campo %s',
    (field) => {
      const item = build({ [field]: undefined });

      expect(validationPaths(item)).toContain(field);
    },
  );

  it('debería validar sin errores un item completo', () => {
    expect(validationPaths(build())).toEqual([]);
  });
});

describe('min', () => {
  it.each(['minStock', 'averageCost', 'reservedStock', 'totalStock'])(
    'debería rechazar un %s negativo',
    (field) => {
      const item = build({ [field]: -1 });

      expect(validationPaths(item)).toContain(field);
    },
  );

  it('debería aceptar un isPerishable en true', () => {
    expect(validationPaths(build({ isPerishable: true }))).toEqual([]);
  });

  it('debería aceptar un isPerishable en false', () => {
    expect(validationPaths(build({ isPerishable: false }))).toEqual([]);
  });

  it('debería aceptar cualquier condición de almacenamiento', () => {
    expect(validationPaths(build({ storageCondition: 'Congelado' }))).toEqual(
      [],
    );
  });
});

describe('trim y casting', () => {
  it('debería recortar los espacios del nombre', () => {
    expect(build({ name: '  Tomate  ' }).name).toBe('Tomate');
  });

  it('debería recortar los espacios del sku', () => {
    expect(build({ sku: '  ING-0001  ' }).sku).toBe('ING-0001');
  });

  it('debería recortar los espacios de la categoría', () => {
    expect(build({ category: '  Verduras  ' }).category).toBe('Verduras');
  });

  it('debería convertir un minStock numérico en texto a number', () => {
    const item = build({ minStock: '7' });

    expect(item.minStock).toBe(7);
    expect(typeof item.minStock).toBe('number');
  });
});

describe('supplierIdSugested', () => {
  it('debería estar tipado como ObjectId', () => {
    expect(ItemSchema.path('supplierIdSugested').instance).toBe('ObjectId');
  });

  it('debería castear un identificador en texto a ObjectId', () => {
    const item = build({
      supplierIdSugested: '507f1f77bcf86cd799439011',
    });

    expect(item.supplierIdSugested).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(item.supplierIdSugested?.toString()).toBe(
      '507f1f77bcf86cd799439011',
    );
  });

  it('debería rechazar un valor que no es un ObjectId', () => {
    const item = build({ supplierIdSugested: 'no-es-un-objectid' });

    expect(validationPaths(item)).toContain('supplierIdSugested');
  });
});

describe('availableStock', () => {
  it('debería calcular el stock disponible descontando el reservado', () => {
    expect(build({ totalStock: 10, reservedStock: 4 }).availableStock).toBe(6);
  });

  it('debería devolver 0 cuando el reservado supera el total', () => {
    expect(build({ totalStock: 3, reservedStock: 9 }).availableStock).toBe(0);
  });

  it('debería devolver 0 cuando no hay stock', () => {
    expect(build().availableStock).toBe(0);
  });
});

describe('status', () => {
  it('debería ser OPTIMO cuando el disponible supera el mínimo', () => {
    expect(
      build({ totalStock: 10, reservedStock: 4, minStock: 3 }).status,
    ).toBe(EstadoUmbral.OPTIMO);
  });

  it('debería ser BAJO cuando el disponible es igual al mínimo', () => {
    expect(
      build({ totalStock: 10, reservedStock: 4, minStock: 6 }).status,
    ).toBe(EstadoUmbral.BAJO);
  });

  it('debería ser BAJO cuando el disponible es menor al mínimo', () => {
    expect(
      build({ totalStock: 10, reservedStock: 8, minStock: 5 }).status,
    ).toBe(EstadoUmbral.BAJO);
  });

  it('debería ser CRITICO cuando no hay stock disponible', () => {
    expect(build({ totalStock: 5, reservedStock: 5 }).status).toBe(
      EstadoUmbral.CRITICO,
    );
  });

  it('debería ser CRITICO cuando el reservado supera el total', () => {
    expect(build({ totalStock: 3, reservedStock: 9 }).status).toBe(
      EstadoUmbral.CRITICO,
    );
  });
});

describe('EstadoUmbral', () => {
  it('debería exponer los tres estados esperados', () => {
    expect(EstadoUmbral.OPTIMO).toBe('OPTIMO');
    expect(EstadoUmbral.BAJO).toBe('BAJO');
    expect(EstadoUmbral.CRITICO).toBe('CRITICO');
  });
});

describe('serialización', () => {
  it('debería incluir availableStock y status en toJSON', () => {
    const json = build({
      totalStock: 10,
      reservedStock: 4,
      minStock: 3,
    }).toJSON();

    expect(json.availableStock).toBe(6);
    expect(json.status).toBe(EstadoUmbral.OPTIMO);
  });

  it('debería incluir availableStock y status en toObject', () => {
    const object = build({
      totalStock: 10,
      reservedStock: 4,
      minStock: 3,
    }).toObject();

    expect(object.availableStock).toBe(6);
    expect(object.status).toBe(EstadoUmbral.OPTIMO);
  });

  it('debería incluir isActive en la serialización', () => {
    expect(build({ isActive: false }).toJSON().isActive).toBe(false);
  });

  it('debería omitir supplierSugested cuando el virtual no está poblado', () => {
    expect('supplierSugested' in build().toJSON()).toBe(false);
  });
});
