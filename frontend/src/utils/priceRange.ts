// Client-side price range checks of PROD-003 (001-ADR-3). Same rules as the backend validator.
export const MSG_NEGATIVE = 'Giá không được âm';
export const MSG_NOT_NUMBER = 'Giá phải là số';
export const MSG_DECIMALS = 'Giá chỉ được có tối đa 2 chữ số thập phân';
export const MSG_TOO_BIG = 'Giá không được lớn hơn $99,999,999.99';
export const MSG_MIN_GT_MAX = 'Giá tối thiểu không được lớn hơn giá tối đa';

export interface PriceRangeErrors {
    min?: string;
    max?: string;
}

export type PriceRangeResult =
    | { ok: true; min: string; max: string }
    | { ok: false; errors: PriceRangeErrors };

const MAX_INT = '99999999';

// checks 1-4 in order; first failure only. Input is already trimmed and not empty.
function firstError(value: string): string | null {
    if (/^-\d/.test(value)) return MSG_NEGATIVE;
    if (!/^\d+(\.\d+)?$/.test(value)) return MSG_NOT_NUMBER;
    const [int = '', frac = ''] = value.split('.');
    if (frac.length > 2) return MSG_DECIMALS;
    const i = int.replace(/^0+(?=\d)/, '');
    let tooBig: boolean;
    if (i.length !== MAX_INT.length) tooBig = i.length > MAX_INT.length;
    else if (i !== MAX_INT) tooBig = i > MAX_INT;
    else tooBig = frac.padEnd(2, '0') > '99';
    return tooBig ? MSG_TOO_BIG : null;
}

function toCents(value: string): bigint {
    const [int = '0', frac = ''] = value.split('.');
    return BigInt(int) * BigInt(100) + BigInt(frac.padEnd(2, '0'));
}

export function checkPriceRange(minInput: string, maxInput: string): PriceRangeResult {
    const min = minInput.trim();
    const max = maxInput.trim();
    const errors: PriceRangeErrors = {};

    const minError = min === '' ? null : firstError(min);
    const maxError = max === '' ? null : firstError(max);
    if (minError) errors.min = minError;
    if (maxError) errors.max = maxError;

    if (!minError && !maxError && min !== '' && max !== '' && toCents(min) > toCents(max)) {
        errors.min = MSG_MIN_GT_MAX;
    }

    if (errors.min || errors.max) return { ok: false, errors };
    return { ok: true, min, max };
}
