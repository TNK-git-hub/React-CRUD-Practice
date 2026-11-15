import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export const MSG_NEGATIVE = 'Giá không được âm';
export const MSG_NOT_NUMBER = 'Giá phải là số';
export const MSG_DECIMALS = 'Giá chỉ được có tối đa 2 chữ số thập phân';
export const MSG_TOO_BIG = 'Giá không được lớn hơn $99,999,999.99';
export const MSG_MIN_GT_MAX = 'Giá tối thiểu không được lớn hơn giá tối đa';

const MAX_INT = '99999999';
const MAX_FRAC = '99';

const stripZeros = (s: string) => s.replace(/^0+(?=\d)/, '');

// Checks 1-4 of PROD-003 in order; returns the first failure only (001-ADR-1)
export function firstBoundError(value: unknown): string | null {
  if (typeof value !== 'string') return MSG_NOT_NUMBER;
  if (/^-\d/.test(value)) return MSG_NEGATIVE;
  if (!/^\d+(\.\d+)?$/.test(value)) return MSG_NOT_NUMBER;
  const [int, frac = ''] = value.split('.');
  if (frac.length > 2) return MSG_DECIMALS;
  const i = stripZeros(int);
  let tooBig: boolean;
  if (i.length !== MAX_INT.length) tooBig = i.length > MAX_INT.length;
  else if (i !== MAX_INT) tooBig = i > MAX_INT;
  else tooBig = frac.padEnd(2, '0') > MAX_FRAC;
  return tooBig ? MSG_TOO_BIG : null;
}

// exact comparison on valid strings (no floats)
function toCents(value: string): bigint {
  const [int, frac = ''] = value.split('.');
  return BigInt(int) * BigInt(100) + BigInt(frac.padEnd(2, '0'));
}

export function isMinAboveMax(min: unknown, max: unknown): boolean {
  if (min === undefined || min === null || max === undefined || max === null) return false;
  if (firstBoundError(min) !== null || firstBoundError(max) !== null) return false;
  return toCents(min as string) > toCents(max as string);
}

export function IsPriceBound(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isPriceBound',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => firstBoundError(value) === null,
        defaultMessage: (args?: ValidationArguments) => firstBoundError(args?.value) ?? MSG_NOT_NUMBER,
      },
    });
  };
}

export function IsMinNotAboveMax(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isMinNotAboveMax',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown, args?: ValidationArguments) =>
          !isMinAboveMax(value, (args?.object as { maxPrice?: unknown } | undefined)?.maxPrice),
        defaultMessage: () => MSG_MIN_GT_MAX,
      },
    });
  };
}
