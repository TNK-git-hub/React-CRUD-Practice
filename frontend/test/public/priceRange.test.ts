import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkPriceRange } from '../../src/utils/priceRange';

const NEGATIVE = 'Giá không được âm';
const NOT_A_NUMBER = 'Giá phải là số';
const DECIMALS = 'Giá chỉ được có tối đa 2 chữ số thập phân';
const TOO_BIG = 'Giá không được lớn hơn $99,999,999.99';
const MIN_GT_MAX = 'Giá tối thiểu không được lớn hơn giá tối đa';

describe('checkPriceRange', () => {
  it('PROD-001-S6 an empty range is valid and means no bound on either side', () => {
    expect(checkPriceRange('', '')).toEqual({ ok: true, min: '', max: '' });
    expect(checkPriceRange('  ', '10')).toEqual({ ok: true, min: '', max: '10' });
  });

  it('PROD-003-S18 valid values are returned trimmed and as typed (010, 20.00)', () => {
    expect(checkPriceRange(' 010 ', '20.00 ')).toEqual({ ok: true, min: '010', max: '20.00' });
  });

  it('PROD-003-S4 a negative value (-0 included) fails check 1 for the side that has it', () => {
    expect(checkPriceRange('-1', '')).toEqual({ ok: false, errors: { min: NEGATIVE } });
    expect(checkPriceRange('', '-0.01')).toEqual({ ok: false, errors: { max: NEGATIVE } });
    expect(checkPriceRange('-0', '')).toEqual({ ok: false, errors: { min: NEGATIVE } });
  });

  describe('PROD-003-S5 not a number', () => {
    it.each([['abc'], ['10,5'], ['1,000'], ['1e3'], ['+5'], ['.5'], ['5.']])('"%s" fails check 2', (v) => {
      expect(checkPriceRange(v, '')).toEqual({ ok: false, errors: { min: NOT_A_NUMBER } });
    });
  });

  it('PROD-003-S10 more than 2 decimals fails check 3', () => {
    expect(checkPriceRange('', '10.123')).toEqual({ ok: false, errors: { max: DECIMALS } });
    expect(checkPriceRange('1.000', '')).toEqual({ ok: false, errors: { min: DECIMALS } });
  });

  it('PROD-003-S8 99999999.99 and 0 are valid; 100000000 is too large', () => {
    expect(checkPriceRange('0', '99999999.99')).toEqual({ ok: true, min: '0', max: '99999999.99' });
    expect(checkPriceRange('', '100000000')).toEqual({ ok: false, errors: { max: TOO_BIG } });
  });

  it('PROD-003-S9 leading zeros do not hide a too-large value: 000000000100000000 is too large, 0000099999999 is valid', () => {
    expect(checkPriceRange('', '000000000100000000')).toEqual({ ok: false, errors: { max: TOO_BIG } });
    expect(checkPriceRange('', '0000099999999')).toEqual({ ok: true, min: '', max: '0000099999999' });
  });

  it('PROD-003-S9 8 whole digits are compared by value: 99999998.99 valid, 100000000.00 too large, 99999999.995 fails decimals first', () => {
    expect(checkPriceRange('', '99999998.99').ok).toBe(true);
    expect(checkPriceRange('', '100000000.00')).toEqual({ ok: false, errors: { max: TOO_BIG } });
    expect(checkPriceRange('', '99999999.995')).toEqual({ ok: false, errors: { max: DECIMALS } });
  });

  it('PROD-003-S14 a 30-digit value is too large and does not crash', () => {
    expect(checkPriceRange('', '123456789012345678901234567890')).toEqual({ ok: false, errors: { max: TOO_BIG } });
  });

  it('PROD-003-S15 min > max is reported for the minimum; 9 <= 10 and 010 = 10 are fine', () => {
    expect(checkPriceRange('30', '10')).toEqual({ ok: false, errors: { min: MIN_GT_MAX } });
    expect(checkPriceRange('10', '9')).toEqual({ ok: false, errors: { min: MIN_GT_MAX } });
    expect(checkPriceRange('9', '10').ok).toBe(true);
    expect(checkPriceRange('010', '10').ok).toBe(true);
    expect(checkPriceRange('10.50', '10.5').ok).toBe(true);
  });

  it('PROD-003-S17 each input keeps only its first failure and min > max is not added on top of another error', () => {
    expect(checkPriceRange('-5', '10.123')).toEqual({ ok: false, errors: { min: NEGATIVE, max: DECIMALS } });
    expect(checkPriceRange('abc', '5')).toEqual({ ok: false, errors: { min: NOT_A_NUMBER } });
  });

  it('PROD-003-S19 -0 is negative, not zero', () => {
    expect(checkPriceRange('-0', '5')).toEqual({ ok: false, errors: { min: NEGATIVE } });
  });

  it('PROD-001-S8 min = max is valid', () => {
    expect(checkPriceRange('10', '10')).toEqual({ ok: true, min: '10', max: '10' });
  });

  it('PROD-003-S18 every plain number 0..99999999.99 with at most 2 decimals is valid as typed (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999999 }),
        fc.option(fc.integer({ min: 0, max: 99 }), { nil: undefined }),
        fc.integer({ min: 0, max: 4 }),
        (whole, cents, zeros) => {
          const text = '0'.repeat(zeros) + String(whole) + (cents === undefined ? '' : '.' + String(cents).padStart(2, '0'));
          expect(checkPriceRange(text, '')).toEqual({ ok: true, min: text, max: '' });
        },
      ),
    );
  });

  it('PROD-003-S9 any digit string whose value exceeds 99999999 is too large (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100000000, max: 10 ** 15 }),
        fc.integer({ min: 0, max: 12 }),
        (whole, zeros) => {
          const text = '0'.repeat(zeros) + String(whole);
          expect(checkPriceRange('', text)).toEqual({ ok: false, errors: { max: TOO_BIG } });
        },
      ),
    );
  });
});
