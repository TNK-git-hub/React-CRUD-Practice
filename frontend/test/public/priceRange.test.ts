import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as priceRange from '../../src/utils/priceRange';

// SPEC_PROBLEM: tasks.md T002 does not fix the return shape of checkPriceRange. This adapter is the only place
// that knows it: it accepts { errors: { min|minPrice, max|maxPrice }, ... } for failures and { min, max } (or
// { minPrice, maxPrice }) for success. Fix it here if the real shape differs.
interface Checked {
  minError?: string;
  maxError?: string;
  min?: string;
  max?: string;
  valid: boolean;
}

const MSG = {
  negative: 'Giá không được âm',
  notNumber: 'Giá phải là số',
  decimals: 'Giá chỉ được có tối đa 2 chữ số thập phân',
  tooBig: 'Giá không được lớn hơn $99,999,999.99',
  minGtMax: 'Giá tối thiểu không được lớn hơn giá tối đa',
} as const;

const rawCheck: (min: string, max: string) => unknown = priceRange.checkPriceRange;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const pick = (o: unknown, ...keys: string[]): unknown => {
  if (typeof o !== 'object' || o === null) return undefined;
  const rec = o as Record<string, unknown>;
  for (const k of keys) if (k in rec) return rec[k];
  return undefined;
};

function check(min: string, max: string): Checked {
  const raw = rawCheck(min, max);
  const errors = pick(raw, 'errors', 'error');
  const minError = str(pick(errors, 'min', 'minPrice'));
  const maxError = str(pick(errors, 'max', 'maxPrice'));
  const value = pick(raw, 'value', 'values', 'range') ?? raw;
  return {
    minError,
    maxError,
    min: str(pick(value, 'min', 'minPrice')),
    max: str(pick(value, 'max', 'maxPrice')),
    valid: minError === undefined && maxError === undefined,
  };
}

// Reference: an independent exact decimal comparison on integer cents, used only for generated data
const centsStr = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

describe('checkPriceRange', () => {
  it('PROD-001-S6 trims leading and trailing spaces and reports no error', () => {
    // Catches: no trim, or "Giá phải là số" for padded values
    const r = check(' 10 ', ' 20 ');

    expect(r.valid).toBe(true);
    expect(r.min).toBe('10');
    expect(r.max).toBe('20');
  });

  it('PROD-001-S6 padding never changes the outcome for any valid pair', () => {
    // Catches: trimming on one side only
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.nat({ max: 4 }),
        fc.nat({ max: 4 }),
        (a, b, l, t) => {
          const lo = centsStr(Math.min(a, b));
          const hi = centsStr(Math.max(a, b));
          const r = check(' '.repeat(l) + lo + ' '.repeat(t), ' '.repeat(t) + hi + ' '.repeat(l));

          expect(r.valid).toBe(true);
          expect(r.min).toBe(lo);
          expect(r.max).toBe(hi);
        },
      ),
    );
  });

  it('PROD-001-S5 empty or blank inputs mean no bound and no error', () => {
    // Catches: "Giá phải là số" reported for an empty input
    for (const [a, b] of [['', ''], ['  ', ''], ['', '5'], ['5', '   ']] as const) {
      const r = check(a, b);
      expect(r.valid).toBe(true);
    }
    expect(check('', '').min).toBeUndefined();
    expect(check('', '5').max).toBe('5');
    expect(check('', '5').min).toBeUndefined();
  });

  it('PROD-001-S8 minimum equal to the maximum is valid', () => {
    // Catches: check 5 using >= instead of >
    const r = check('20', '20');

    expect(r.valid).toBe(true);
    expect(r.min).toBe('20');
    expect(r.max).toBe('20');
  });

  it('PROD-003-S4 each input gets its own message: -5 negative, 10.123 too many decimals', () => {
    // Catches: one shared error for both inputs
    const r = check('-5', '10.123');

    expect(r.minError).toBe(MSG.negative);
    expect(r.maxError).toBe(MSG.decimals);
  });

  it.each(['abc', '10,5', '1e3'])('PROD-003-S5 "%s" is not a number', (v) => {
    // Catches: Number() / parseFloat accepting 1e3 or 10 from "10,5"
    expect(check(v, '').minError).toBe(MSG.notNumber);
    expect(check('', v).maxError).toBe(MSG.notNumber);
  });

  it.each(['+5', '.5', '5.', '1,000', '1 000', '0x10', '5e', '--5', '１０'])(
    'PROD-003-S5 "%s" is not a plain number',
    (v) => {
      // Catches: a loose regular expression
      expect(check(v, '').minError).toBe(MSG.notNumber);
    },
  );

  it('PROD-003-S5 any string that is neither a plain number nor minus-then-number gets "Giá phải là số"', () => {
    // Catches: wrong order or a loose format check, over arbitrary text
    const plain = /^\d+(\.\d+)?$/;
    const minusNumber = /^-\d/;
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), (s) => {
        const t = s.trim();
        fc.pre(t !== '' && !plain.test(t) && !minusNumber.test(t));

        expect(check(s, '').minError).toBe(MSG.notNumber);
      }),
    );
  });

  it('PROD-003-S8 0 and 99999999.99 are valid and returned as typed', () => {
    // Catches: upper bound exclusive; 0 treated as empty
    const r = check('0', '99999999.99');

    expect(r.valid).toBe(true);
    expect(r.min).toBe('0');
    expect(r.max).toBe('99999999.99');
  });

  it('PROD-003-S9 100000000 is above the limit', () => {
    // Catches: missing check 4
    expect(check('', '100000000').maxError).toBe(MSG.tooBig);
  });

  it('PROD-003-S9 99999999.995 fails on decimals first, 100000000.00 on the limit', () => {
    // Catches: wrong order of checks 3 and 4 / limit compared on rounded value
    expect(check('', '99999999.995').maxError).toBe(MSG.decimals);
    expect(check('', '100000000.00').maxError).toBe(MSG.tooBig);
  });

  it('PROD-003-S10 -0.01 is negative and 0 is valid', () => {
    // Catches: small negatives accepted
    expect(check('-0.01', '').minError).toBe(MSG.negative);
    const ok = check('0', '');
    expect(ok.valid).toBe(true);
    expect(ok.min).toBe('0');
  });

  it('PROD-003-S14 a 30-digit value gives the limit message and does not throw', () => {
    // Catches: float / Number overflow or a crash on huge input
    const big = '123456789012345678901234567890';

    expect(check('', big).maxError).toBe(MSG.tooBig);
  });

  it('PROD-003-S14 long digit strings: never throws, the limit message appears exactly when the value is above the limit', () => {
    // Catches: float comparison losing precision near the limit
    fc.assert(
      fc.property(fc.stringMatching(/^[1-9][0-9]{0,40}$/), (digits) => {
        const above = BigInt(digits) >= 100000000n;

        const r = check('', digits);

        expect(r.maxError).toBe(above ? MSG.tooBig : undefined);
      }),
    );
  });

  it('PROD-003-S15 min 30 and max 10: the error is reported for the minimum only', () => {
    // Catches: error placed on the maximum, or not raised
    const r = check('30', '10');

    expect(r.minError).toBe(MSG.minGtMax);
    expect(r.maxError).toBeUndefined();
  });

  it('PROD-003-S15 min > max error appears exactly when min is numerically greater (not string-wise)', () => {
    // Catches: comparing strings ("9" > "10") instead of numbers
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999 }), fc.integer({ min: 0, max: 99_999 }), (a, b) => {
        const r = check(centsStr(a), centsStr(b));

        expect(r.minError).toBe(a > b ? MSG.minGtMax : undefined);
        expect(r.maxError).toBeUndefined();
      }),
    );
    expect(check('9', '10').valid).toBe(true);
  });

  it('PROD-003-S17 min "30,5" and max "10": only "Giá phải là số", no min > max message', () => {
    // Catches: check 5 running although a bound already failed
    const r = check('30,5', '10');

    expect(r.minError).toBe(MSG.notNumber);
    expect(r.maxError).toBeUndefined();
  });

  it('PROD-003-S17 each input shows at most one message, in the order of the checks', () => {
    // Catches: several messages at once or checks run in the wrong order
    expect(check('-abc', '').minError).toBe(MSG.notNumber);
    expect(check('', '-1.234').maxError).toBe(MSG.negative);
    expect(check('', '1.234').maxError).toBe(MSG.decimals);
    expect(check('', '100000000.123').maxError).toBe(MSG.decimals);
  });

  it('PROD-003-S18 "010" and "20.00" are valid and returned exactly as typed', () => {
    // Catches: normalising to 10 / 20
    const r = check('010', '20.00');

    expect(r.valid).toBe(true);
    expect(r.min).toBe('010');
    expect(r.max).toBe('20.00');
  });

  it('PROD-003-S19 "-0" is negative', () => {
    // Catches: a negative check that only looks at the numeric value
    expect(check('-0', '').minError).toBe(MSG.negative);
  });
});
