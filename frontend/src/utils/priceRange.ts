// Kiểm tra khoảng giá (001-ADR-3). Chỉ dùng chuỗi, không dùng Number/float để so sánh.
export const PRICE_MSG = {
    negative: 'Giá không được âm',
    notNumber: 'Giá phải là số',
    decimals: 'Giá chỉ được có tối đa 2 chữ số thập phân',
    tooBig: 'Giá không được lớn hơn $99,999,999.99',
    minGtMax: 'Giá tối thiểu không được lớn hơn giá tối đa',
} as const;

export type PriceRangeResult =
    | { ok: true; min: string; max: string }
    | { ok: false; errors: { min?: string; max?: string } };

const MAX_INT = '99999999';
const MAX_FRAC = '99';

// [phần nguyên không số 0 đầu, phần thập phân đệm đủ 2 chữ số] của chuỗi đã qua check 1-3
function normalize(value: string): [string, string] {
    const [int, frac = ''] = value.split('.');
    return [int.replace(/^0+(?=\d)/, ''), frac.padEnd(2, '0')];
}

// so sánh số học chính xác 2 chuỗi hợp lệ: <0, 0, >0
function compare(a: string, b: string): number {
    const [ai, af] = normalize(a);
    const [bi, bf] = normalize(b);
    if (ai.length !== bi.length) return ai.length - bi.length;
    if (ai !== bi) return ai < bi ? -1 : 1;
    if (af !== bf) return af < bf ? -1 : 1;
    return 0;
}

// trả message của lỗi đầu tiên, hoặc undefined nếu ô hợp lệ (ô rỗng hợp lệ)
function checkOne(value: string): string | undefined {
    if (value === '') return undefined;
    if (/^-\.?\d/.test(value)) return PRICE_MSG.negative;
    if (!/^\d+(\.\d+)?$/.test(value)) return PRICE_MSG.notNumber;
    const frac = value.split('.')[1] ?? '';
    if (frac.length > 2) return PRICE_MSG.decimals;
    if (compare(value, `${MAX_INT}.${MAX_FRAC}`) > 0) return PRICE_MSG.tooBig;
    return undefined;
}

export function checkPriceRange(minInput: string, maxInput: string): PriceRangeResult {
    const min = minInput.trim();
    const max = maxInput.trim();
    const errors: { min?: string; max?: string } = {};

    const minError = checkOne(min);
    const maxError = checkOne(max);
    if (minError) errors.min = minError;
    if (maxError) errors.max = maxError;

    if (!minError && !maxError && min !== '' && max !== '' && compare(min, max) > 0) {
        errors.min = PRICE_MSG.minGtMax;
    }

    if (errors.min || errors.max) return { ok: false, errors };
    return { ok: true, min, max };
}
