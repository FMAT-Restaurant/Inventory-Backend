import { Transform } from 'class-transformer';
import { ValidateBy, ValidationOptions } from 'class-validator';

// Tope de cantidades de stock (3 decimales), alineado con el de los
// movimientos de inventario.
export const MAX_QUANTITY = 999999999.999;
// Tope de importes unitarios (costos).
export const MAX_AMOUNT = 999999999.9999;

export const QUANTITY_DECIMALS = 3;
export const AMOUNT_DECIMALS = 4;

/**
 * Recorta los espacios de los extremos antes de validar, para que un texto
 * formado solo por espacios se rechace con 400 (`IsNotEmpty`) en lugar de
 * llegar a la base de datos.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/**
 * Valida que un número no tenga más de `decimals` decimales. Se usa en lugar
 * de `IsNumber({ maxDecimalPlaces })`, que falla con valores en notación
 * exponencial como `1e-7`.
 */
export function MaxDecimals(
  decimals: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxDecimals',
      constraints: [decimals],
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          Number(value.toFixed(decimals)) === value,
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must not have more than ${decimals} decimal places`,
      },
    },
    options,
  );
}
